#!/usr/bin/env node
'use strict';
import {FastMCP} from 'fastmcp';
import {z} from 'zod';
import { create_api_headers, poll_task_result, send_session_instructions, create_tool_fn } from './utils.js';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const package_json = require('./package.json');
const api_token = process.env.API_TOKEN;
const project_name = process.env.PROJECT_NAME;

if (!api_token)
    throw new Error('Cannot run MCP server without API_TOKEN env');
if (!project_name)
    throw new Error('Cannot run MCP server without PROJECT_NAME env');

let debug_stats = {tool_calls: {}};
const api_headers = create_api_headers(package_json, api_token);
const tool_fn = create_tool_fn(debug_stats);

let server = new FastMCP({
    name: 'BrowserAI',
    version: package_json.version,
});

function createSessionManager() {
    const active_sessions = new Map();
    return {
        track_session: (id) => {
            active_sessions.set(id, {
                created: Date.now(),
                lastActivity: Date.now()
            });
        },
        update_activity: (id) => {
            const session = active_sessions.get(id);
            if (session) {
                session.lastActivity = Date.now();
            }
        },
        get_sessions: () => Array.from(active_sessions.entries()),
        remove_session: (id) => active_sessions.delete(id)
    };
}

const sessionManager = createSessionManager();

server.addTool({
    name: 'start_new_session',
    description: 'Start a new browser session. ' +
        'Provide an instruction like "Go to https://example.com" or "Search for products on Amazon". ' +
        'Returns executionId for the session and initial page data with interactive elements and HTML markup.',
    parameters: z.object({
        instruction: z.string(),
        geoLocation: z.object({
            country: z.string().optional().default('US')
        }).optional(),
        extractData: z.boolean().optional().default(true)
    }),
    execute: tool_fn('start_new_session', async ({ instruction, geoLocation, extractData }, { log, reportProgress }) => {
        log.info('start_new_session task started', { instruction, geoLocation, extractData });
        const url = 'https://browser.ai/api/v1/tasks';
        const method = 'POST';
        const instructions = [{action: instruction}];
        if (extractData) 
        {
            instructions.push({
                action: 'Extract all clickable elements, input fields, buttons, and links from the page. ' +
                    'Also get the complete HTML markup. ' +
                    'Return the result as a JSON object with this exact format: ' +
                    '{"interactive_elements": ["element1", "element2", ...], "html_markup": "complete_html_string"}. ' +
                    'Do not add any extra text or formatting.'
            });
        }
        const body = {
            geoLocation: geoLocation || {country: 'US'},
            awaitable: true,
            instructions,
            project: project_name,
            type: 'natural_language',
        };
        log.info('Fetching URL', { url, method, instructionsCount: body.instructions.length });
        let response = await fetch(url, {
            method,
            body: JSON.stringify(body),
            headers: api_headers(),
        });
        if (!response.ok) {
            const errorText = await response.text();
            log.error('Failed to start new session', { status: response.status, statusText: response.statusText, error: errorText });
            throw new Error(`Failed to start new session: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        const task_id = data.executionId;
        log.info('Received task ID from API', { task_id, response_data: data });
        if (task_id) 
        {
            sessionManager.track_session(task_id);
            let result = await poll_task_result(task_id, api_headers, { log, reportProgress });
            return JSON.stringify({executionId: task_id, result});
        }
        throw new Error('No execution ID received from API');
    }),
});

server.addTool({
    name: 'interact_and_extract_in_session',
    description: 'Interact with elements in an existing browser session. ' +
        'Provide an array of instructions like ["Click the login button", "Fill email field with test@example.com", "Scroll down"]. ' +
        'Returns updated page data after the interactions.',
    parameters: z.object({
        instructions: z.array(z.string()),
        executionId: z.string(),
        extractData: z.boolean().optional().default(true),
        waitTime: z.number().optional().default(2)
    }),
    execute: tool_fn('interact_and_extract_in_session', async ({ instructions, executionId, extractData, waitTime }, { log, reportProgress }) => {
        log.info('interact_and_extract_in_session task started', { instructions, executionId, extractData, waitTime });
        const instructions_payload = instructions.map(action => ({action}));
        if (waitTime > 0) 
            instructions_payload.push({action: `Wait ${waitTime} seconds for the page to update after the interaction`});
        if (extractData) 
        {
            instructions_payload.push({
                action: 'After performing the actions, extract all clickable elements, input fields, buttons, and links from the current page. ' +
                    'Also get the complete HTML markup. ' +
                    'Return the result as a JSON object with this exact format: ' +
                    '{"interactive_elements": ["element1", "element2", ...], "html_markup": "complete_html_string"}. ' +
                    'Do not add any extra text or formatting.'
            });
        }
        sessionManager.update_activity(executionId); // Update session activity
        return await send_session_instructions(
            executionId,
            instructions_payload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'extract_from_session',
    description: 'Extract specific data from the current page in a browser session. ' +
        'Provide an array of extraction instructions, e.g., ["Extract all product names and prices as JSON array", "Get the page title and meta description"].',
    parameters: z.object({
        instructions: z.array(z.string()),
        executionId: z.string()
    }),
    execute: tool_fn('extract_from_session', async ({ instructions, executionId }, { log, reportProgress }) => {
        log.info('extract_from_session task started', { instructions, executionId });
        const instructions_payload = instructions.map(action => ({action}));
        instructions_payload.push({action: 'Return the extracted data as a clean JSON object. ' +
            'No additional text, explanations, or formatting. ' +
            'Just the JSON response as specified in the extraction instruction.'});
        sessionManager.update_activity(executionId); // Update session activity
        return await send_session_instructions(
            executionId,
            instructions_payload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'get_session_status',
    description: 'Check the current status and information of a browser session. ' +
        'Useful for debugging or verifying session state.',
    parameters: z.object({executionId: z.string()}),
    execute: tool_fn('get_session_status', async ({ executionId }, { log, reportProgress }) => {
        log.info('get_session_status task started', { executionId });
        const url = `https://browser.ai/api/v1/tasks/${executionId}`;
        let response = await fetch(url, {
            method: 'GET',
            headers: api_headers(),
        });
        if (!response.ok) 
        {
            const errorText = await response.text();
            log.error('Failed to get session status', { status: response.status, statusText: response.statusText, error: errorText });
            throw new Error(`Failed to get session status: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const data = await response.json();
        return JSON.stringify(data);
    }),
});

server.addTool({
    name: 'wait_for_element',
    description: 'Wait for a specific element to appear on the page before proceeding. ' +
        'Useful for dynamic content that loads after page load. ' +
        'Provide element selector or description to wait for.',
    parameters: z.object({
        instruction: z.string(),
        executionId: z.string(),
        timeout: z.number().optional().default(30)
    }),
    execute: tool_fn('wait_for_element', async ({ instruction, executionId, timeout }, { log, reportProgress }) => {
        log.info('wait_for_element task started', { instruction, executionId, timeout });
        const instructionsPayload = [
            {action: `Wait up to ${timeout} seconds for this element to appear: ${instruction}`},
            {action: 'Once the element is found, extract all clickable elements, input fields, buttons, and links from the current page. ' +
                'Also get the complete HTML markup. ' +
                'Return the result as a JSON object with this exact format: ' +
                '{"interactive_elements": ["element1", "element2", ...], "html_markup": "complete_html_string", "element_found": true}. ' +
                'If timeout occurs, return {"element_found": false, "error": "Element not found within timeout"}.'}
        ];
        return await send_session_instructions(
            executionId,
            instructionsPayload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'navigate_to_url',
    description: 'Navigate to a specific URL in an existing browser session. ' +
        'Useful for moving between pages while maintaining session state.',
    parameters: z.object({
        url: z.string(),
        executionId: z.string()
    }),
    execute: tool_fn('navigate_to_url', async ({ url, executionId }, { log, reportProgress }) => {
        log.info('navigate_to_url task started', { url, executionId });
        const instructionsPayload = [
            {action: `Navigate to ${url}`},
            {action: 'After navigation completes, extract all clickable elements, input fields, buttons, and links from the page. ' +
                'Also get the complete HTML markup and current URL. ' +
                'Return the result as a JSON object with this exact format: ' +
                '{"interactive_elements": ["element1", "element2", ...], "html_markup": "complete_html_string", "current_url": "actual_url"}. ' +
                'Do not add any extra text or formatting.'}
        ];
        return await send_session_instructions(
            executionId,
            instructionsPayload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'get_page_info',
    description: 'Get comprehensive information about the current page including title, URL, meta tags, and page structure. ' +
        'Useful for understanding page context before interactions.',
    parameters: z.object({executionId: z.string()}),
    execute: tool_fn('get_page_info', async ({ executionId }, { log, reportProgress }) => {
        log.info('get_page_info task started', { executionId });
        const instructionsPayload = [
            {action: 'Extract comprehensive page information including title, URL, meta description, meta keywords, and page structure'},
            {action: 'Return the page information as a JSON object with this exact format: ' +
                '{"title": "page_title", "url": "current_url", "meta_description": "description", "meta_keywords": "keywords", ' +
                '"page_structure": {"headings": ["h1", "h2", ...], "forms": ["form1", "form2", ...], "images": ["img1", "img2", ...]}}. ' +
                'Do not add any extra text or formatting.'}
        ];
        return await send_session_instructions(
            executionId,
            instructionsPayload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'batch_actions',
    description: 'Execute multiple actions in sequence within a single browser session. ' +
        'Provide an array of actions to perform one after another. ' +
        'Useful for complex workflows like login -> navigate -> extract data.',
    parameters: z.object({
        actions: z.array(z.string()),
        executionId: z.string(),
        stopOnError: z.boolean().optional().default(true),
        delayBetweenActions: z.number().optional().default(1)
    }),
    execute: tool_fn('batch_actions', async ({ actions, executionId, stopOnError, delayBetweenActions }, { log, reportProgress }) => {
        log.info('batch_actions task started', { actionsCount: actions.length, executionId, stopOnError, delayBetweenActions });
        const instructionsPayload = [];
        actions.forEach((action, index) => {
            instructionsPayload.push({action: action});
            if (index < actions.length - 1 && delayBetweenActions > 0) {
                instructionsPayload.push({action: `Wait ${delayBetweenActions} seconds before next action`});
            }
        });
        instructionsPayload.push({
            action: 'After completing all actions, extract all clickable elements, input fields, buttons, and links from the final page. ' +
                'Also get the complete HTML markup. ' +
                'Return the result as a JSON object with this exact format: ' +
                '{"interactive_elements": ["element1", "element2", ...], "html_markup": "complete_html_string", "actions_completed": ' + actions.length + '}. ' +
                'Do not add any extra text or formatting.'
        });
        return await send_session_instructions(
            executionId,
            instructionsPayload,
            api_headers,
            { log, reportProgress },
            project_name
        );
    }),
});

server.addTool({
    name: 'list_active_sessions',
    description: 'List all currently active browser sessions with their status and basic information. ' +
        'Useful for session management and debugging.',
    parameters: z.object({}),
    execute: tool_fn('list_active_sessions', async ({}, { log, reportProgress }) => {
        log.info('list_active_sessions task started');
        const sessions = sessionManager.get_sessions();
        const sessionData = sessions.map(([id, data]) => ({
            executionId: id,
            created: new Date(data.created).toISOString(),
            lastActivity: new Date(data.lastActivity).toISOString(),
            ageMinutes: Math.round((Date.now() - data.created) / 60000)
        }));
        return JSON.stringify({
            activeSessions: sessionData,
            totalSessions: sessionData.length,
            timestamp: new Date().toISOString()
        });
    }),
});

console.error('Starting server...');
server.start({transportType: 'stdio'});

