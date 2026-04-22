# n8n-nodes-ozor

Community n8n node for the [Ozor AI Video Generation API](https://ozor.ai).

Generate, edit, export, and turn documents into narrated videos — directly from your n8n workflows.

## Operations

The node exposes two resources: **Video** and **Document**.

### Video

| Operation             | Description                                                                 |
|-----------------------|-----------------------------------------------------------------------------|
| Generate Video        | Create a new video from a text prompt (with optional image/video refs)     |
| List Videos           | Retrieve API-created videos (newest first)                                  |
| Get Video Details     | Status, export info, `downloadUrl` / `shareUrl`                             |
| Export Video          | Trigger an MP4 render at 720p / 1080p / 4K, public or signed                |
| Send Message (Edit)   | Iterate on a video — change copy, swap colors, reorder scenes, etc.         |
| Get Job Status        | Poll a generate / message agent job                                         |

### Document

| Operation         | Description                                                                  |
|-------------------|------------------------------------------------------------------------------|
| List Voices       | Available TTS voices                                                         |
| Analyze Document  | Upload a PDF / PPTX / DOCX (binary input) or a URL → scene-by-scene plan     |
| Get Plan          | Retrieve a plan (image URLs are refreshed on every read)                     |
| Update Plan       | Edit scenes or voice settings before generation                              |
| Generate From Plan| Render the plan into a video (consumes the SSE stream and returns `projectId`) |

### Features

- **Auto-export on generate** — trigger export immediately when creating a video.
- **Public share links** — set `Export Is Public` / `Is Public` to get a permanent `shareUrl` + `shareCode`.
- **Wait for completion** — built-in polling for both agent jobs and exports; downstream nodes receive the final `downloadUrl` / `shareUrl` / agent reply directly.
- **Media attachments** — pass image and video references (URL or base64) to `generate` and `message`.
- **Aspect ratio & quality** — landscape (16:9) or portrait (9:16); 720p, 1080p, or 4K.
- **Document-to-video** — upload a PDF/PPTX/DOCX as n8n binary data, or hand in a URL.

## Setup

### 1. Get your API key

Sign up at [ozor.ai](https://ozor.ai) and create an API key in the dashboard (Settings → API Keys).

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

In n8n, go to **Credentials → New → Ozor API** and paste your API key. The credential test hits `GET /api/v1/videos` to validate the key.

## Example workflows

### Prompt → generate → public share link

1. **Manual Trigger** (or Webhook)
2. **Ozor** — Resource: Video, Operation: Generate Video
   - Enable **Auto-Export**, **Export Is Public**, **Wait for Export**
3. **Slack** / **Email** — send `{{$json.shareUrl}}`

### Edit an existing video

1. **Ozor** — Operation: Send Message (Edit)
   - `Video ID`: `abc123`, `Message`: `"Add our logo in the top-right corner"`, **Wait for Agent**: on
2. **Ozor** — Operation: Export Video
   - `Video ID`: `={{$json.videoId}}`, **Wait for Export**: on

### PDF → narrated video

1. **Read/Download File** (produces binary data)
2. **Ozor** — Resource: Document, Operation: Analyze Document
   - Input Type: Binary File, Binary Property: `data`
3. *(optional)* **Ozor** — Operation: Update Plan (rewrite voiceover / pick a voice)
4. **Ozor** — Operation: Generate From Plan → returns `projectId`
5. **Ozor** — Operation: Export Video, `Video ID`: `={{$json.projectId}}`

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
