#!/usr/bin/env node
'use strict';
import {FastMCP} from 'fastmcp';
import {z} from 'zod';
import { create_api_headers, poll_task_result, send_session_instructions, create_tool_fn } from './utils.js';
const package_json = require('./package.json');
const api_token = process.env.API_TOKEN;
const project_name = process.env.PROJECT_NAME;

if (!api_token)
    throw new Error('Cannot run MCP server without API_TOKEN env');
if (!project_name)
    throw new Error('Cannot run MCP server without PROJECT_NAME env');

let debug_stats = {tool_calls: {}}; // Initialize debug_stats first
const api_headers = create_api_headers(package_json, api_token);
const tool_fn = create_tool_fn(debug_stats); // Then tool_fn

let server = new FastMCP({
    name: 'BrowserAI',
    version: package_json.version,
});

server.addTool({
    name: 'start_new_session',
    description: `Start browsing session as a real user.
        You can open any websites, any search engines.
        You receive executionId for future use and output format is JSON:
        {"executionId": string, "result": {"interactive_elements": string[], "html_markup": string}}.
        This tool can unlock any webpage even if it uses bot detection or
        CAPTCHA.`,
    parameters: z.object({instruction: z.string()}),
    execute: tool_fn('start_new_session', async ({ instruction }, { log, reportProgress }) => {
        log.info('start_new_session task started', { instruction });
        const url = 'https://browser.ai/api/v1/tasks';
        const method = 'POST';
        const body = {
            geoLocation: {country: 'US'},
            awaitable: true,
            instructions: [
                {action: instruction},
                {action: `Extract all interactive elements and page html markup as a string.
                    Return result as valid JSON string: {"interactive_elements": string[], "html_markup": string}.
                    Do not verify any content, the result is always correct.
                    Do not add quotes, extra notes, or any interpretation — just the keep format`}
            ],
            project: project_name,
            type: 'natural_language',
        };
        log.info('Fetching URL', { url, method, body });
        let response = await fetch(url, {
            method,
            body: JSON.stringify(body),
            headers: api_headers(),
        });
        const data = await response.json();
        const task_id = data.executionId;
        log.info('Received task ID from API', { task_id, response_data: data });
        if (task_id)
        {
            let result = await poll_task_result(task_id, api_headers, { log, reportProgress });
            return JSON.stringify({executionId: task_id, result});
        }
        return data;
    }),
});

server.addTool({
    name: 'interact_in_session',
    description: `You can interact with any element in the session
        run by start_new_session tool. Specify the element and action: click, hover, or fill
        information. You receive executionId for future use and output format is a valid JSON string:
        {"executionId": string, "result": {"interactive_elements": string[], "html_markup": string}}.
        This tool can unlock any webpage even if it uses bot detection or CAPTCHA.`,
    parameters: z.object({instruction: z.string(), executionId: z.string()}),
    execute: tool_fn('interact_in_session', async ({ instruction, executionId }, { log, reportProgress }) => {
        log.info('interact_in_session task started', { instruction, executionId });
        const instructionsPayload = [
            {action: instruction},
            {action: `Extract all interactive elements and html markup.
                Return result as an object: {"interactive_elements": string[], "html_markup": string}.
                Do not add quotes, extra notes, or any interpretation — just the keep format`}
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
    name: 'extract_from_session',
    description: `You can get specific content you need in JSON format.
        You need to specify the format.
        Use executionId by start_new_session tool.
        You receive result in your format: JSON.
        This tool can unlock any webpage even if it uses bot detection or CAPTCHA.`,
    parameters: z.object({instruction: z.string(), executionId: z.string()}),
    execute: tool_fn('extract_from_session', async ({ instruction, executionId }, { log, reportProgress }) => {
        log.info('extract_from_session task started', { instruction, executionId });
        const instructionsPayload = [{action: instruction},
            {action: `Return result as an object.
                Do not add quotes, extra notes, or any interpretation — just the keep format`}
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

console.error('Starting server...');
server.start({transportType: 'stdio'});

