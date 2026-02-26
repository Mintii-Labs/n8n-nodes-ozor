# n8n-nodes-ozor

Community n8n node for the [Ozor AI Video Generation API](https://ozor.ai).

Generate, list, export, and download AI-powered videos directly from your n8n workflows.

## Operations

| Operation             | Description                                      |
|-----------------------|--------------------------------------------------|
| **Generate Video**    | Create a new video from a text prompt            |
| **List Videos**       | Retrieve all videos created via the API          |
| **Get Video Details** | Get status, export info, and download URL        |
| **Export Video**      | Trigger an MP4 export for an existing video      |

### Features

- **Auto-export on generate** — optionally trigger export immediately when creating a video.
- **Wait for export** — built-in polling so downstream nodes receive the `downloadUrl` directly.
- **Configurable quality** — 720p, 1080p, or 4K exports.
- **Aspect ratio** — landscape (16:9) or portrait (9:16).

## Setup

### 1. Get your API key

Sign up at [ozor.ai](https://ozor.ai) and create an API key from your dashboard.

### 2. Install the node

#### In n8n (community nodes)

Go to **Settings → Community Nodes → Install** and enter:

```
n8n-nodes-ozor
```

#### Manual / development

```bash
cd ~/.n8n/custom
git clone https://github.com/Mintii-Labs/n8n-nodes-ozor.git
cd n8n-nodes-ozor
npm install
npm run build
```

Then restart n8n.

### 3. Add credentials

In n8n, go to **Credentials → New → Ozor API** and paste your API key.

## Example workflow

**Prompt → Generate → Wait → Slack notification with download link:**

1. **Manual Trigger** or **Webhook**
2. **Ozor** node — Operation: "Generate Video", enable Auto-Export + Wait for Export
3. **Slack** node — send `{{$json.downloadUrl}}` to a channel

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # production build
npm run lint     # lint
```

## Publishing to npm

```bash
npm login
npm publish
```

## License

MIT
