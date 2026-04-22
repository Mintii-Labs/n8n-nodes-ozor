/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	ApplicationError,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeConnectionTypes,
	sleep,
} from 'n8n-workflow';
// form-data is a transitive dep shipped with n8n's HTTP stack — no types bundled.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data');

const API_BASE = 'https://ozor.ai/api';
const DEFAULT_POLL_SECONDS = 300;
const MAX_STREAM_TIMEOUT_MS = 15 * 60 * 1000; // 15 min — enough for large plan renders

type MediaCollection = {
	item?: Array<{
		url?: string;
		base64?: string;
		mimeType?: string;
		durationSec?: number;
		thumbnailUrl?: string;
	}>;
};

export class Ozor implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ozor',
		name: 'ozor',
		icon: 'file:ozor.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate, edit, and export AI videos via the Ozor API',
		defaults: {
			name: 'Ozor',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'ozorApi',
				required: true,
			},
		],
		properties: [
			// ------ Resource selector ------
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Video', value: 'video' },
					{ name: 'Document', value: 'document' },
				],
				default: 'video',
			},

			// ====================================================================
			// Video operations
			// ====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['video'] } },
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
						description: 'Get status, export info, and download URL',
						action: 'Get video details',
					},
					{
						name: 'Export Video',
						value: 'export',
						description: 'Trigger an MP4 export for an existing video',
						action: 'Export a video',
					},
					{
						name: 'Send Message (Edit)',
						value: 'message',
						description: 'Send a natural-language edit instruction to the agent',
						action: 'Send a message to the agent',
					},
					{
						name: 'Get Job Status',
						value: 'getJob',
						description: 'Poll a generate or message job',
						action: 'Get agent job status',
					},
				],
				default: 'generate',
			},

			// ====================================================================
			// Document operations
			// ====================================================================
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['document'] } },
				options: [
					{
						name: 'List Voices',
						value: 'listVoices',
						description: 'List available TTS voices',
						action: 'List TTS voices',
					},
					{
						name: 'Analyze Document',
						value: 'analyze',
						description: 'Turn a PDF, PPTX, DOCX, or URL into a scene-by-scene plan',
						action: 'Analyze a document',
					},
					{
						name: 'Get Plan',
						value: 'getPlan',
						description: 'Retrieve an analysis plan',
						action: 'Get an analysis plan',
					},
					{
						name: 'Update Plan',
						value: 'updatePlan',
						description: 'Edit scenes or voice settings before generation',
						action: 'Update an analysis plan',
					},
					{
						name: 'Generate From Plan',
						value: 'generatePlan',
						description: 'Render a plan into a video (streams SSE progress)',
						action: 'Generate a video from a plan',
					},
				],
				default: 'analyze',
			},

			// --------------------------------------------------------------------
			// Video → Generate
			// --------------------------------------------------------------------
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: { show: { resource: ['video'], operation: ['generate'] } },
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
				displayOptions: { show: { resource: ['video'], operation: ['generate'] } },
			},
			{
				displayName: 'Auto-Export',
				name: 'export',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['video'], operation: ['generate'] } },
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
					show: { resource: ['video'], operation: ['generate'], export: [true] },
				},
			},
			{
				displayName: 'Export Is Public',
				name: 'exportIsPublic',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['video'], operation: ['generate'], export: [true] },
				},
				description: 'Whether to get a permanent public shareUrl instead of a 24h signed downloadUrl',
			},
			{
				displayName: 'Wait for Export',
				name: 'waitForExport',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['video'], operation: ['generate'], export: [true] },
				},
				description: 'Whether to poll until the export is complete before returning',
			},
			{
				displayName: 'Wait for Agent',
				name: 'waitForAgent',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: { resource: ['video'], operation: ['generate'], export: [false] },
				},
				description: 'Whether to poll the agent job until it completes and return the reply',
			},
			{
				displayName: 'Max Poll Time (Seconds)',
				name: 'maxPollTime',
				type: 'number',
				default: DEFAULT_POLL_SECONDS,
				displayOptions: {
					show: { resource: ['video'], operation: ['generate'] },
				},
				description: 'Maximum time in seconds to wait when polling',
			},
			mediaAttachmentField('images', 'Images', 'video', 'generate'),
			mediaAttachmentField('videos', 'Videos', 'video', 'generate'),

			// --------------------------------------------------------------------
			// Video → List
			// --------------------------------------------------------------------
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 20,
				typeOptions: { minValue: 1, maxValue: 100 },
				displayOptions: { show: { resource: ['video'], operation: ['list'] } },
				description: 'Max number of videos to return (1–100)',
			},

			// --------------------------------------------------------------------
			// Video → Get / Export / Message / GetJob — common videoId
			// --------------------------------------------------------------------
			{
				displayName: 'Video ID',
				name: 'videoId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['video'],
						operation: ['get', 'export', 'message', 'getJob'],
					},
				},
				description: 'The video (project) ID',
			},

			// --------------------------------------------------------------------
			// Video → Export
			// --------------------------------------------------------------------
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
				displayOptions: { show: { resource: ['video'], operation: ['export'] } },
			},
			{
				displayName: 'Is Public',
				name: 'isPublic',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['video'], operation: ['export'] } },
				description: 'Whether to return a permanent shareUrl + shareCode (public) or a 24h signed downloadUrl',
			},
			{
				displayName: 'Wait for Export',
				name: 'waitForExportSingle',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['video'], operation: ['export'] } },
				description: 'Whether to poll until the export is complete before returning',
			},
			{
				displayName: 'Max Poll Time (Seconds)',
				name: 'maxPollTimeSingle',
				type: 'number',
				default: DEFAULT_POLL_SECONDS,
				displayOptions: {
					show: {
						resource: ['video'],
						operation: ['export'],
						waitForExportSingle: [true],
					},
				},
			},

			// --------------------------------------------------------------------
			// Video → Message
			// --------------------------------------------------------------------
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: { show: { resource: ['video'], operation: ['message'] } },
				description: 'Natural-language edit instruction (1–2000 chars)',
			},
			{
				displayName: 'Wait for Agent',
				name: 'waitForMessageAgent',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['video'], operation: ['message'] } },
				description: 'Whether to poll the agent job until it completes and return the reply',
			},
			{
				displayName: 'Max Poll Time (Seconds)',
				name: 'maxPollTimeMessage',
				type: 'number',
				default: DEFAULT_POLL_SECONDS,
				displayOptions: {
					show: {
						resource: ['video'],
						operation: ['message'],
						waitForMessageAgent: [true],
					},
				},
			},
			mediaAttachmentField('images', 'Images', 'video', 'message'),
			mediaAttachmentField('videos', 'Videos', 'video', 'message'),

			// --------------------------------------------------------------------
			// Video → GetJob
			// --------------------------------------------------------------------
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['video'], operation: ['getJob'] } },
				description: 'The agent job ID returned by generate or message',
			},
			{
				displayName: 'Wait for Completion',
				name: 'waitForJob',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['video'], operation: ['getJob'] } },
				description: 'Whether to poll until the job completes or fails',
			},
			{
				displayName: 'Max Poll Time (Seconds)',
				name: 'maxPollTimeJob',
				type: 'number',
				default: DEFAULT_POLL_SECONDS,
				displayOptions: {
					show: {
						resource: ['video'],
						operation: ['getJob'],
						waitForJob: [true],
					},
				},
			},

			// --------------------------------------------------------------------
			// Document → Analyze
			// --------------------------------------------------------------------
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				options: [
					{ name: 'URL', value: 'url' },
					{ name: 'Binary File (From Previous Node)', value: 'binary' },
				],
				default: 'url',
				displayOptions: { show: { resource: ['document'], operation: ['analyze'] } },
			},
			{
				displayName: 'URL',
				name: 'sourceUrl',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['analyze'],
						inputType: ['url'],
					},
				},
				description: 'Public http(s):// URL — the page is fetched and its text is analyzed',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryPropertyName',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['analyze'],
						inputType: ['binary'],
					},
				},
				description: 'Name of the input item\'s binary field containing the PDF/PPTX/DOCX (max 50 MB)',
			},
			{
				displayName: 'Target Duration (Seconds)',
				name: 'targetDurationSec',
				type: 'number',
				default: 30,
				displayOptions: { show: { resource: ['document'], operation: ['analyze'] } },
				description: 'Target output duration — drives scene count',
			},
			{
				displayName: 'Aspect Ratio',
				name: 'analyzeAspect',
				type: 'options',
				options: [
					{ name: 'Landscape (16:9)', value: '16:9' },
					{ name: 'Portrait (9:16)', value: '9:16' },
				],
				default: '16:9',
				displayOptions: { show: { resource: ['document'], operation: ['analyze'] } },
			},
			{
				displayName: 'Prompt (Optional)',
				name: 'analyzePrompt',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				displayOptions: { show: { resource: ['document'], operation: ['analyze'] } },
				description: 'Optional guidance on tone, focus, audience, language, etc',
			},

			// --------------------------------------------------------------------
			// Document → Get / Update / Generate Plan
			// --------------------------------------------------------------------
			{
				displayName: 'Plan ID',
				name: 'planId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: {
						resource: ['document'],
						operation: ['getPlan', 'updatePlan', 'generatePlan'],
					},
				},
			},

			// --------------------------------------------------------------------
			// Document → Update Plan
			// --------------------------------------------------------------------
			{
				displayName: 'Scenes (JSON)',
				name: 'scenesJson',
				type: 'json',
				default: '[]',
				displayOptions: { show: { resource: ['document'], operation: ['updatePlan'] } },
				description:
					'Full replacement array of scenes. Each scene needs order, sceneTitle, scenePrompt, voiceoverText. Leave empty [] to skip.',
			},
			{
				displayName: 'Voice Settings',
				name: 'voiceSettings',
				type: 'collection',
				placeholder: 'Add Voice Setting',
				default: {},
				displayOptions: { show: { resource: ['document'], operation: ['updatePlan'] } },
				options: [
					{
						displayName: 'Voice ID',
						name: 'voiceId',
						type: 'string',
						default: '',
						description: 'A voice id from the List Voices operation. Omit to auto-select by language.',
					},
					{
						displayName: 'Speaking Style',
						name: 'speakingStyle',
						type: 'string',
						default: '',
						description: 'Free-text style hint (e.g. "formal", "energetic", "calm")',
					},
					{
						displayName: 'Speaking Rate',
						name: 'speakingRate',
						type: 'number',
						typeOptions: { minValue: 0.5, maxValue: 2.0, numberStepSize: 0.1 },
						default: 1.0,
					},
				],
			},

			// --------------------------------------------------------------------
			// Document → Generate (SSE)
			// --------------------------------------------------------------------
			{
				displayName: 'Return Progress Events',
				name: 'returnProgressEvents',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['document'], operation: ['generatePlan'] } },
				description:
					'Whether to include every SSE progress event in the output. When false (default), only the final event is returned.',
			},
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = (this.getNodeParameter('resource', i, 'video') as string) || 'video';
				const operation = this.getNodeParameter('operation', i) as string;
				let responseData: any;

				if (resource === 'video') {
					responseData = await runVideoOperation.call(this, operation, i);
				} else if (resource === 'document') {
					responseData = await runDocumentOperation.call(this, operation, i);
				} else {
					throw new ApplicationError(`Unknown resource: ${resource}`);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw new NodeApiError(this.getNode(), error as any, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

// ============================================================================
// Helpers — property builders
// ============================================================================

function mediaAttachmentField(
	name: 'images' | 'videos',
	displayName: string,
	resource: string,
	operation: string,
) {
	const isVideo = name === 'videos';
	return {
		displayName,
		name,
		type: 'fixedCollection' as const,
		typeOptions: { multipleValues: true },
		placeholder: `Add ${displayName.slice(0, -1)}`,
		default: {},
		displayOptions: { show: { resource: [resource], operation: [operation] } },
		options: [
			{
				name: 'item',
				displayName: displayName.slice(0, -1),
				values: [
					{
						displayName: 'URL',
						name: 'url',
						type: 'string' as const,
						default: '',
						description: 'Publicly accessible HTTPS URL',
					},
					{
						displayName: 'Base64',
						name: 'base64',
						type: 'string' as const,
						typeOptions: { rows: 2 },
						default: '',
						description: 'Raw base64 (no data: prefix). Takes precedence over URL when set.',
					},
					{
						displayName: 'MIME Type',
						name: 'mimeType',
						type: 'string' as const,
						default: '',
						description: isVideo
							? 'video/mp4 or video/webm. Recommended when using base64.'
							: 'image/jpeg, image/png, or image/webp. Recommended when using base64.',
					},
					...(isVideo
						? [
								{
									displayName: 'Duration (Seconds)',
									name: 'durationSec',
									type: 'number' as const,
									default: 0,
									description: 'Clip duration — helps the agent reason about pacing',
								},
								{
									displayName: 'Thumbnail URL',
									name: 'thumbnailUrl',
									type: 'string' as const,
									default: '',
								},
							]
						: []),
				],
			},
		],
	};
}

// ============================================================================
// Video operations
// ============================================================================

async function runVideoOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<any> {
	if (operation === 'generate') {
		const prompt = this.getNodeParameter('prompt', i) as string;
		const aspect = this.getNodeParameter('aspect', i) as string;
		const autoExport = this.getNodeParameter('export', i) as boolean;

		const body: IDataObject = { prompt, aspect, export: autoExport };
		if (autoExport) {
			body.exportQuality = this.getNodeParameter('exportQuality', i) as string;
			body.exportIsPublic = this.getNodeParameter('exportIsPublic', i) as boolean;
		}
		attachMedia.call(this, body, i);

		let response = await ozorRequest.call(this, {
			method: 'POST',
			url: `${API_BASE}/v1/videos/generate`,
			body,
		});

		if (autoExport) {
			const waitForExport = this.getNodeParameter('waitForExport', i, false) as boolean;
			if (waitForExport) {
				const maxPollTime = this.getNodeParameter('maxPollTime', i) as number;
				response = await pollForExport.call(this, response.videoId, maxPollTime);
			}
		} else {
			const waitForAgent = this.getNodeParameter('waitForAgent', i, false) as boolean;
			if (waitForAgent) {
				const maxPollTime = this.getNodeParameter('maxPollTime', i) as number;
				response = await pollForJob.call(this, response.videoId, response.jobId, maxPollTime);
			}
		}

		return response;
	}

	if (operation === 'list') {
		const limit = this.getNodeParameter('limit', i) as number;
		return ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/videos`,
			qs: { limit },
		});
	}

	if (operation === 'get') {
		const videoId = encodeURIComponent(this.getNodeParameter('videoId', i) as string);
		return ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/videos/${videoId}`,
		});
	}

	if (operation === 'export') {
		const videoId = encodeURIComponent(this.getNodeParameter('videoId', i) as string);
		const quality = this.getNodeParameter('quality', i) as string;
		const isPublic = this.getNodeParameter('isPublic', i) as boolean;

		let response = await ozorRequest.call(this, {
			method: 'POST',
			url: `${API_BASE}/v1/videos/${videoId}/export`,
			body: { quality, isPublic },
		});

		if (this.getNodeParameter('waitForExportSingle', i, false) as boolean) {
			const maxPollTime = this.getNodeParameter('maxPollTimeSingle', i) as number;
			response = await pollForExport.call(this, videoId, maxPollTime);
		}
		return response;
	}

	if (operation === 'message') {
		const videoId = encodeURIComponent(this.getNodeParameter('videoId', i) as string);
		const message = this.getNodeParameter('message', i) as string;

		const body: IDataObject = { message };
		attachMedia.call(this, body, i);

		let response = await ozorRequest.call(this, {
			method: 'POST',
			url: `${API_BASE}/v1/videos/${videoId}/message`,
			body,
		});

		if (this.getNodeParameter('waitForMessageAgent', i, false) as boolean) {
			const maxPollTime = this.getNodeParameter('maxPollTimeMessage', i) as number;
			response = await pollForJob.call(this, videoId, response.jobId, maxPollTime);
		}
		return response;
	}

	if (operation === 'getJob') {
		const videoId = encodeURIComponent(this.getNodeParameter('videoId', i) as string);
		const jobId = encodeURIComponent(this.getNodeParameter('jobId', i) as string);
		const waitForJob = this.getNodeParameter('waitForJob', i, false) as boolean;

		if (waitForJob) {
			const maxPollTime = this.getNodeParameter('maxPollTimeJob', i) as number;
			return pollForJob.call(this, videoId, jobId, maxPollTime);
		}
		return ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/videos/${videoId}/jobs/${jobId}`,
		});
	}

	throw new ApplicationError(`Unknown video operation: ${operation}`);
}

// ============================================================================
// Document operations
// ============================================================================

async function runDocumentOperation(
	this: IExecuteFunctions,
	operation: string,
	i: number,
): Promise<any> {
	if (operation === 'listVoices') {
		return ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/documents/voices`,
		});
	}

	if (operation === 'analyze') {
		const inputType = this.getNodeParameter('inputType', i) as 'url' | 'binary';
		const targetDuration = this.getNodeParameter('targetDurationSec', i) as number;
		const aspect = this.getNodeParameter('analyzeAspect', i) as string;
		const prompt = this.getNodeParameter('analyzePrompt', i, '') as string;

		const form = new FormData();
		form.append('target_duration_sec', String(targetDuration));
		form.append('aspect_ratio', aspect);
		if (prompt) form.append('prompt', prompt);

		if (inputType === 'url') {
			const sourceUrl = this.getNodeParameter('sourceUrl', i) as string;
			form.append('url', sourceUrl);
		} else {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
			const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
			const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
			form.append('file', buffer, {
				filename: binaryData.fileName ?? 'upload',
				contentType: binaryData.mimeType ?? 'application/octet-stream',
			});
		}

		return this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
			method: 'POST',
			url: `${API_BASE}/v1/documents/analyze`,
			body: form,
			headers: form.getHeaders(),
			json: true,
		});
	}

	if (operation === 'getPlan') {
		const planId = encodeURIComponent(this.getNodeParameter('planId', i) as string);
		return ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/documents/plans/${planId}`,
		});
	}

	if (operation === 'updatePlan') {
		const planId = encodeURIComponent(this.getNodeParameter('planId', i) as string);
		const scenesJson = this.getNodeParameter('scenesJson', i, '[]') as string | unknown[];
		const voiceSettings = this.getNodeParameter('voiceSettings', i, {}) as IDataObject;

		let scenes: unknown[] = [];
		if (typeof scenesJson === 'string') {
			const trimmed = scenesJson.trim();
			if (trimmed.length > 0) {
				try {
					scenes = JSON.parse(trimmed);
				} catch (e) {
					throw new ApplicationError(`scenes must be valid JSON: ${(e as Error).message}`);
				}
			}
		} else if (Array.isArray(scenesJson)) {
			scenes = scenesJson;
		}
		if (!Array.isArray(scenes)) {
			throw new ApplicationError('scenes must be a JSON array');
		}

		const body: IDataObject = {};
		if (scenes.length > 0) body.scenes = scenes;
		if (Object.keys(voiceSettings).length > 0) body.voiceSettings = voiceSettings;

		return ozorRequest.call(this, {
			method: 'PATCH',
			url: `${API_BASE}/v1/documents/plans/${planId}`,
			body,
		});
	}

	if (operation === 'generatePlan') {
		const planId = encodeURIComponent(this.getNodeParameter('planId', i) as string);
		const returnProgress = this.getNodeParameter('returnProgressEvents', i, false) as boolean;

		const rawBody = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'ozorApi',
			{
				method: 'POST',
				url: `${API_BASE}/v1/documents/plans/${planId}/generate`,
				headers: { Accept: 'text/event-stream' },
				json: false,
				encoding: 'text',
				timeout: MAX_STREAM_TIMEOUT_MS,
			},
		)) as string | Buffer;

		const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
		const events = parseSseEvents(text);

		const errorEvent = events.find((e) => e.step === 'error');
		if (errorEvent) {
			throw new ApplicationError(
				`Ozor plan generation failed: ${errorEvent.detail ?? 'unknown error'}`,
			);
		}

		const doneEvent = events.find((e) => e.step === 'done');
		if (!doneEvent) {
			throw new ApplicationError(
				'Ozor plan generation stream ended without a done event',
			);
		}

		return returnProgress ? { ...doneEvent, events } : doneEvent;
	}

	throw new ApplicationError(`Unknown document operation: ${operation}`);
}

// ============================================================================
// Helpers — HTTP + polling + parsing
// ============================================================================

async function ozorRequest(
	this: IExecuteFunctions,
	opts: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; body?: IDataObject; qs?: IDataObject },
): Promise<any> {
	return this.helpers.httpRequestWithAuthentication.call(this, 'ozorApi', {
		method: opts.method,
		url: opts.url,
		body: opts.body,
		qs: opts.qs,
		json: true,
	});
}

function attachMedia(this: IExecuteFunctions, body: IDataObject, i: number): void {
	const images = this.getNodeParameter('images', i, {}) as MediaCollection;
	const videos = this.getNodeParameter('videos', i, {}) as MediaCollection;

	const mapItem = (it: NonNullable<MediaCollection['item']>[number]) => {
		const out: IDataObject = {};
		if (it.url) out.url = it.url;
		if (it.base64) out.base64 = it.base64;
		if (it.mimeType) out.mimeType = it.mimeType;
		if (typeof it.durationSec === 'number' && it.durationSec > 0) out.durationSec = it.durationSec;
		if (it.thumbnailUrl) out.thumbnailUrl = it.thumbnailUrl;
		return out;
	};

	const imageItems = (images.item ?? []).map(mapItem).filter((it) => Object.keys(it).length > 0);
	const videoItems = (videos.item ?? []).map(mapItem).filter((it) => Object.keys(it).length > 0);

	if (imageItems.length > 0) body.images = imageItems;
	if (videoItems.length > 0) body.videos = videoItems;
}

async function pollForExport(
	this: IExecuteFunctions,
	videoId: string,
	maxPollTimeSeconds: number,
): Promise<any> {
	const startTime = Date.now();
	const deadline = startTime + maxPollTimeSeconds * 1000;
	const encoded = encodeURIComponent(videoId);

	while (Date.now() < deadline) {
		const status = await ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/videos/${encoded}`,
		});

		if (status.exportStatus === 'complete') return status;
		if (status.exportStatus === 'failed') {
			throw new ApplicationError(
				`Ozor export failed: ${status.exportError || 'Unknown error'}`,
			);
		}

		await sleep(pollInterval(Date.now() - startTime));
	}

	throw new ApplicationError(`Ozor export timed out after ${maxPollTimeSeconds} seconds`);
}

async function pollForJob(
	this: IExecuteFunctions,
	videoId: string,
	jobId: string,
	maxPollTimeSeconds: number,
): Promise<any> {
	const startTime = Date.now();
	const deadline = startTime + maxPollTimeSeconds * 1000;
	const encodedVideo = encodeURIComponent(videoId);
	const encodedJob = encodeURIComponent(jobId);

	while (Date.now() < deadline) {
		const status = await ozorRequest.call(this, {
			method: 'GET',
			url: `${API_BASE}/v1/videos/${encodedVideo}/jobs/${encodedJob}`,
		});

		if (status.status === 'completed') return status;
		if (status.status === 'failed') {
			throw new ApplicationError(
				`Ozor agent job failed: ${status.error || 'Unknown error'}`,
			);
		}

		await sleep(pollInterval(Date.now() - startTime));
	}

	throw new ApplicationError(`Ozor agent job timed out after ${maxPollTimeSeconds} seconds`);
}

// Docs recommend 2–3s for the first minute, 5–10s after.
function pollInterval(elapsedMs: number): number {
	return elapsedMs < 60_000 ? 3_000 : 7_000;
}

type SseEvent = { step?: string; detail?: string; pct?: number; projectId?: string } & IDataObject;

function parseSseEvents(text: string): SseEvent[] {
	const events: SseEvent[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.startsWith('data:')) continue;
		const payload = line.slice(5).trim();
		if (!payload) continue;
		try {
			events.push(JSON.parse(payload) as SseEvent);
		} catch {
			// ignore malformed lines
		}
	}
	return events;
}
