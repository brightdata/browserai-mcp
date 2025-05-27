'use strict';

export function create_api_headers(package_json, api_token) {
    return () => {
        const headers = new Headers();
        headers.append('user-agent', `${package_json.name}/${package_json.version}`);
        headers.append('authorization', `apikey ${api_token}`);
        headers.append('Content-Type', 'application/json');
        return headers;
    };
}

export async function poll_task_result(task_id, headers_fn, { log, reportProgress }) {
    let idx = 0;
    while (true)
    {
        const url = `https://browser.ai/api/v1/tasks/${task_id}`;
        const response = await fetch(url, {method: 'GET', headers: headers_fn()});
        const result_data = await response.json();
        log.info('Task poll status', { task_id, status: result_data.status });
        if (typeof reportProgress === 'function') 
            reportProgress({ progress: idx ++, total: 20 });
        if (['finalized', 'awaiting'].includes(result_data.status)) {
            log.info(`Task ${result_data.status}`, { task_id, result: result_data.result });
            return result_data.result;
        }
        if (result_data.status == 'failed') {
            log.error('Task poll failed', { task_id, error: result_data.error });
            throw new Error(`Task ${task_id} failed: ${result_data.error}`);
        }
        await new Promise(resolve=>setTimeout(resolve, 3000));
    }
}

export async function send_session_instructions(executionId, instructionsPayload, headers_fn, { log, reportProgress }, project_name) {
    const url = `https://browser.ai/api/v1/tasks/${executionId}/instructions`;
    const body = {
        geoLocation: {country: 'US'},
        awaitable: true,
        instructions: instructionsPayload,
        project: project_name,
        type: 'natural_language',
    };
    log.info('Sending instructions to session', { url, executionId, instructionsCount: instructionsPayload.length });
    let response = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: headers_fn(),
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        log.error('Failed to send instructions', { status: response.status, statusText: response.statusText, error: errorText });
        throw new Error(`Failed to send instructions: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const data = await response.json();
    const task_id = data.executionId;
    
    await new Promise(resolve=>setTimeout(resolve, 1000));
    log.info('Received task ID from API after sending instructions', { task_id, responseData: data });
    if (task_id) {
        let result = await poll_task_result(task_id, headers_fn, { log, reportProgress });
        return JSON.stringify({executionId: task_id, result});
    }
    log.error('No task_id received after sending instructions', { responseData: data });
    throw new Error('No task ID received from API after sending instructions');
}

export function create_tool_fn(debug_stats) {
    return (name, fn) => {
        return async (params, executionContext) => {
            const { log } = executionContext;
            debug_stats.tool_calls[name] = (debug_stats.tool_calls[name] || 0) + 1;
            const ts = Date.now();
            log.info(`[${name}] Executing tool`, { params });
            try {
                return await fn(params, executionContext);
            } catch(e) {
                if (e.response) {
                    let error_text = '';
                    try {
                        error_text = await e.response.text();
                    } catch (textError) {
                        log.error(`[${name}] Failed to get error response text`, { textError });
                    }
                    log.error(`[${name}] HTTP error`, { status: e.response.status, statusText: e.response.statusText, body: error_text });
                    if (error_text?.length) {
                        throw new Error(`HTTP ${e.response.status}: ${error_text}`);
                    }
                    throw new Error(`HTTP ${e.response.status}: ${e.response.statusText || 'Unknown HTTP error'}`);
                } else if (e.name === 'FetchError' || e instanceof TypeError) {
                    log.error(`[${name}] Fetch error`, e);
                    throw new Error(`Network error: ${e.message}`);
                } else {
                    log.error(`[${name}] Unexpected error`, e);
                }
                throw e;
            } finally {
                const dur = Date.now() - ts;
                log.info(`[${name}] Tool finished`, { duration_ms: dur });
            }
        };
    };
}
