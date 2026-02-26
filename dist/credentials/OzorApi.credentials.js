"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OzorApi = void 0;
class OzorApi {
    constructor() {
        this.name = 'ozorApi';
        this.displayName = 'Ozor API';
        this.icon = 'file:../nodes/Ozor/ozor.svg';
        this.documentationUrl = 'https://ozor.ai';
        this.properties = [
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
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'X-API-Key': '={{$credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: 'https://ozor.ai/api',
                url: '/v1/videos',
                method: 'GET',
            },
        };
    }
}
exports.OzorApi = OzorApi;
//# sourceMappingURL=OzorApi.credentials.js.map