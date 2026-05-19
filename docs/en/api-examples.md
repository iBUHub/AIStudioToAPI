# API Usage Examples

This document provides simple API usage examples, including OpenAI-compatible API, Gemini native API, and Anthropic-compatible API formats.

## 🤖 OpenAI-Compatible API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "stream": false
  }'
```

### 🌊 Streaming Response

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Write a short poem about autumn"
      }
    ],
    "stream": true
  }'
```

### 🖼️ Generate Image [Official Docs](https://ai.google.dev/gemini-api/docs/image-generation)

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "Generate a kitten"
      }
    ],
    "stream": false
  }'
```

#### 🫗 Stream Generation

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "Generate a kitten"
      }
    ],
    "stream": true
  }'
```

### 📐 Text Embeddings [Official Docs](https://ai.google.dev/gemini-api/docs/embeddings)

```bash
curl -X POST http://localhost:7860/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-embedding-001",
    "input": "What is artificial intelligence?"
  }'
```

### 💬 Responses API

```bash
curl -X POST http://localhost:7860/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "input": "Summarize the main idea of functional programming in 3 sentences.",
    "stream": false
  }'
```

#### 🌊 Streaming Responses API

```bash
curl -X POST http://localhost:7860/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "Write a short poem about autumn."
          }
        ]
      }
    ],
    "stream": true
  }'
```

## ♊ Gemini Native API Format

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello, how are you?"
          }
        ]
      }
    ]
  }'
```

### 🌊 Streaming Content Generation

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Write a short poem about autumn"
          }
        ]
      }
    ]
  }'
```

### 🖼️ Generate Image [Official Docs](https://ai.google.dev/gemini-api/docs/image-generation)

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-image:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Generate a kitten"
          }
        ]
      }
    ]
  }'
```

#### 🫗 Stream Generation

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-image:streamGenerateContent?alt=sse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Generate a kitten"
          }
        ]
      }
    ]
  }'
```

### 🎨 Imagen (Image Generation) [Official Docs](https://ai.google.dev/gemini-api/docs/imagen)

Use the `imagen` series models to generate images through the `:predict` endpoint.

#### Basic Image Generation

```bash
curl -X POST http://localhost:7860/v1beta/models/imagen-4.0-generate-001:predict \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "instances": [
      {
        "prompt": "Robot holding a red skateboard"
      }
    ],
    "parameters": {
      "sampleCount": 1
    }
  }'
```

#### Generate Multiple Images

Adjust `sampleCount` to generate multiple images at once (maximum 4).

```bash
curl -X POST http://localhost:7860/v1beta/models/imagen-4.0-generate-001:predict \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "instances": [
      {
        "prompt": "A futuristic city at sunset with flying cars"
      }
    ],
    "parameters": {
      "sampleCount": 4
    }
  }'
```

> 💡 **Tip**: Imagen responses return base64-encoded image data. Each generated image will be included in the `predictions` array.

### 🎤 TTS (Text-to-Speech) [Official Docs](https://ai.google.dev/gemini-api/docs/speech-generation)

#### Basic TTS (Default Voice)

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello, this is a text-to-speech test."
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"]
    }
  }'
```

#### Specify Voice

Available voices: `Kore`, `Puck`, `Charon`, `Fenrir`, `Aoede`

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Hello, this is a text-to-speech test."
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "prebuiltVoiceConfig": {
            "voiceName": "Kore"
          }
        }
      }
    }
  }'
```

#### Multi-Speaker Dialogue

Write the dialogue in the prompt and configure multiple speaker voices using `multiSpeakerVoiceConfig` (up to 2 speakers).

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-2.5-flash-preview-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "TTS the following conversation between Joe and Jane:\nJoe: How are you today Jane?\nJane: I am doing great, thanks for asking!"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "multiSpeakerVoiceConfig": {
          "speakerVoiceConfigs": [
            {
              "speaker": "Joe",
              "voiceConfig": {
                "prebuiltVoiceConfig": {
                  "voiceName": "Charon"
                }
              }
            },
            {
              "speaker": "Jane",
              "voiceConfig": {
                "prebuiltVoiceConfig": {
                  "voiceName": "Kore"
                }
              }
            }
          ]
        }
      }
    }
  }'
```

> 💡 **Tip**: TTS responses return base64-encoded audio data in `audio/L16;codec=pcm;rate=24000` format. You need to decode and convert it to WAV format for playback.

### 📐 Text Embeddings [Official Docs](https://ai.google.dev/gemini-api/docs/embeddings)

Use the `embedContent` or `batchEmbedContents` endpoint to generate text embedding vectors.

#### Single Text Embedding

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-embedding-001:embedContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {
      "parts": [
        {
          "text": "What is artificial intelligence?"
        }
      ]
    }
  }'
```

#### Single Batch Text Embedding

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-embedding-001:batchEmbedContents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "requests": [
      {
        "model": "models/gemini-embedding-001",
        "content": {
          "parts": [
            {
              "text": "What is artificial intelligence?"
            }
          ]
        }
      }
    ]
  }'
```

#### Batch Text Embeddings

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-embedding-001:batchEmbedContents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "requests": [
      {
        "model": "models/gemini-embedding-001",
        "content": {
          "parts": [
            {
              "text": "What is artificial intelligence?"
            }
          ]
        }
      },
      {
        "model": "models/gemini-embedding-001",
        "content": {
          "parts": [
            {
              "text": "What is the difference between machine learning and deep learning?"
            }
          ]
        }
      }
    ]
  }'
```

## 👤 Anthropic Compatible API

```bash
curl -X POST http://localhost:7860/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-1" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ],
    "stream": false
  }'
```

### 🌊 Streaming Response

```bash
curl -X POST http://localhost:7860/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-api-key-1" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "gemini-2.5-flash-lite",
    "max_tokens": 1024,
    "messages": [
      {
        "role": "user",
        "content": "Write a poem about autumn"
      }
    ],
    "stream": true
  }'
```
