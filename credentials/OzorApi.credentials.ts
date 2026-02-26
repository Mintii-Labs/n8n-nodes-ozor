import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class OzorApi implements ICredentialType {
	name = 'ozorApi';

	displayName = 'Ozor API';

	icon: Icon = 'file:../nodes/Ozor/ozor.svg';

	documentationUrl = 'https://ozor.ai';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Ozor API key. Get it from <a href="https://ozor.ai">your Ozor dashboard</a>.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://ozor.ai/api',
			url: '/v1/videos',
			method: 'GET',
		},
	};
}
