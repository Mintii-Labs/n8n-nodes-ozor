"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ozor = void 0;
const n8n_workflow_1 = require("n8n-workflow");
class Ozor {
    constructor() {
        this.description = {
            displayName: 'Ozor',
            name: 'ozor',
            icon: 'file:ozor.svg',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Generate AI-powered videos using the Ozor API',
            defaults: {
                name: 'Ozor',
            },
            inputs: ['main'],
            outputs: ['main'],
            credentials: [
                {
                    name: 'ozorApi',
                    required: true,
                },
            ],
            properties: [
                // ------ Operation selector ------
                {
                    displayName: 'Operation',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Generate Video',
                            value: 'generate',
                            description: 'Create a new video from a text prompt',
                            action: 'Generate a video',
                        },
                        {
                            name: 'List Videos',
                            value: 'list',
                            description: 'Retrieve all videos created via the API',
                            action: 'List videos',
                        },
                        {
                            name: 'Get Video Details',
                            value: 'get',
                            description: 'Get detailed info about a specific video',
                            action: 'Get video details',
                        },
                        {
                            name: 'Export Video',
                            value: 'export',
                            description: 'Trigger an MP4 export for an existing video',
                            action: 'Export a video',
                        },
                    ],
                    default: 'generate',
                },
                // ------ Generate Video fields ------
                {
                    displayName: 'Prompt',
                    name: 'prompt',
                    type: 'string',
                    typeOptions: {
                        rows: 4,
                    },
                    default: '',
                    required: true,
                    displayOptions: {
                        show: { operation: ['generate'] },
                    },
                    description: 'Text prompt describing the video to generate (1–2000 chars)',
                },
                {
                    displayName: 'Aspect Ratio',
                    name: 'aspect',
                    type: 'options',
                    options: [
                        { name: 'Landscape (16:9)', value: '16:9' },
                        { name: 'Portrait (9:16)', value: '9:16' },
                    ],
                    default: '16:9',
                    displayOptions: {
                        show: { operation: ['generate'] },
                    },
                    description: 'Aspect ratio of the generated video',
                },
                {
                    displayName: 'Auto-Export',
                    name: 'export',
                    type: 'boolean',
                    default: false,
                    displayOptions: {
                        show: { operation: ['generate'] },
                    },
                    description: 'Whether to automatically trigger MP4 export after generation',
                },
                {
                    displayName: 'Export Quality',
                    name: 'exportQuality',
                    type: 'options',
                    options: [
                        { name: '720p', value: '720p' },
                        { name: '1080p', value: '1080p' },
                        { name: '4K', value: '4k' },
                    ],
                    default: '720p',
                    displayOptions: {
                        show: {
                            operation: ['generate'],
                            export: [true],
                        },
                    },
                    description: 'Quality of the exported MP4',
                },
                {
                    displayName: 'Wait for Export',
                    name: 'waitForExport',
                    type: 'boolean',
                    default: false,
                    displayOptions: {
                        show: {
                            operation: ['generate'],
                            export: [true],
                        },
                    },
                    description: 'Whether to poll and wait until the export is complete before returning',
                },
                {
                    displayName: 'Max Poll Time (seconds)',
                    name: 'maxPollTime',
                    type: 'number',
                    default: 300,
                    displayOptions: {
                        show: {
                            operation: ['generate'],
                            export: [true],
                            waitForExport: [true],
                        },
                    },
                    description: 'Maximum time in seconds to wait for export completion',
                },
                // ------ List Videos fields ------
                {
                    displayName: 'Limit',
                    name: 'limit',
                    type: 'number',
                    default: 20,
                    typeOptions: {
                        minValue: 1,
                        maxValue: 100,
                    },
                    displayOptions: {
                        show: { operation: ['list'] },
                    },
                    description: 'Number of videos to return (1–100)',
                },
                // ------ Get Video / Export fields ------
                {
                    displayName: 'Video ID',
                    name: 'videoId',
                    type: 'string',
                    default: '',
                    required: true,
                    displayOptions: {
                        show: { operation: ['get', 'export'] },
                    },
                    description: 'The unique ID of the video',
                },
                // ------ Export Video fields ------
                {
                    displayName: 'Quality',
                    name: 'quality',
                    type: 'options',
                    options: [
                        { name: '720p', value: '720p' },
                        { name: '1080p', value: '1080p' },
                        { name: '4K', value: '4k' },
                    ],
                    default: '1080p',
                    displayOptions: {
                        show: { operation: ['export'] },
                    },
                    description: 'Quality of the exported MP4',
                },
                {
                    displayName: 'Wait for Export',
                    name: 'waitForExportSingle',
                    type: 'boolean',
                    default: false,
                    displayOptions: {
                        show: { operation: ['export'] },
                    },
                    description: 'Whether to poll and wait until the export is complete before returning',
                },
                {
                    displayName: 'Max Poll Time (seconds)',
                    name: 'maxPollTimeSingle',
                    type: 'number',
                    default: 300,
                    displayOptions: {
                        show: {
                            operation: ['export'],
                            waitForExportSingle: [true],
                        },
                    },
                    description: 'Maximum time in seconds to wait for export completion',
                },
            ],
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const API_BASE = 'https://ozor.ai/api';
        for (let i = 0; i < items.length; i++) {
            try {
                const operation = this.getNodeParameter('operation', i);
                let responseData;
                // ===== GENERATE VIDEO =====
                if (operation === 'generate') {
                    const prompt = this.getNodeParameter('prompt', i);
                    const aspect = this.getNodeParameter('aspect', i);
                    const autoExport = this.getNodeParameter('export', i);
                    const body = { prompt, aspect, export: autoExport };
                    if (autoExport) {
                        body.exportQuality = this.getNodeParameter('exportQuality', i);
                    }
                    responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
                        method: 'POST',
                        url: `${API_BASE}/v1/videos/generate`,
                        body,
                        json: true,
                    });
                    // Optional polling for export completion
                    if (autoExport && this.getNodeParameter('waitForExport', i)) {
                        const maxPollTime = this.getNodeParameter('maxPollTime', i);
                        responseData = await pollForExport.call(this, API_BASE, responseData.videoId, maxPollTime);
                    }
                }
                // ===== LIST VIDEOS =====
                else if (operation === 'list') {
                    const limit = this.getNodeParameter('limit', i);
                    responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
                        method: 'GET',
                        url: `${API_BASE}/v1/videos`,
                        qs: { limit },
                        json: true,
                    });
                }
                // ===== GET VIDEO DETAILS =====
                else if (operation === 'get') {
                    const videoId = this.getNodeParameter('videoId', i);
                    responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
                        method: 'GET',
                        url: `${API_BASE}/v1/videos/${videoId}`,
                        json: true,
                    });
                }
                // ===== EXPORT VIDEO =====
                else if (operation === 'export') {
                    const videoId = this.getNodeParameter('videoId', i);
                    const quality = this.getNodeParameter('quality', i);
                    responseData = await this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
                        method: 'POST',
                        url: `${API_BASE}/v1/videos/${videoId}/export`,
                        body: { quality },
                        json: true,
                    });
                    // Optional polling for export completion
                    if (this.getNodeParameter('waitForExportSingle', i)) {
                        const maxPollTime = this.getNodeParameter('maxPollTimeSingle', i);
                        responseData = await pollForExport.call(this, API_BASE, videoId, maxPollTime);
                    }
                }
                const executionData = this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(responseData), { itemData: { item: i } });
                returnData.push(...executionData);
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: { error: error.message },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw new n8n_workflow_1.NodeApiError(this.getNode(), error, { itemIndex: i });
            }
        }
        return [returnData];
    }
}
exports.Ozor = Ozor;
// ===== Helper: Poll for export completion =====
async function pollForExport(apiBase, videoId, maxPollTimeSeconds) {
    const startTime = Date.now();
    const POLL_INTERVAL_MS = 5000;
    while (Date.now() - startTime < maxPollTimeSeconds * 1000) {
        const status = await this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
            method: 'GET',
            url: `${apiBase}/v1/videos/${videoId}`,
            json: true,
        });
        if (status.exportStatus === 'complete') {
            return status;
        }
        if (status.exportStatus === 'failed') {
            throw new Error(`Ozor export failed: ${status.exportError || 'Unknown error'}`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Ozor export timed out after ${maxPollTimeSeconds} seconds`);
}
