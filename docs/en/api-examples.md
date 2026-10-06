# API Usage Examples

This document provides simple API usage examples, including OpenAI-compatible API, Gemini native API, and Anthropic-compatible API formats.

## 🤖 OpenAI-Compatible API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-flash-lite-latest",
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
    "model": "gemini-flash-lite-latest",
    "messages": [
      {
        "role": "user",
        "content": "Write a short poem about autumn"
      }
    ],
    "stream": true
  }'
```

### 🖼️ Generate Image [Official Docs](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-3.1-flash-lite-image",
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
    "model": "gemini-3.1-flash-lite-image",
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
    "model": "gemini-flash-lite-latest",
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
    "model": "gemini-flash-lite-latest",
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

### 🎤 Speech Generation

The OpenAI-compatible speech endpoint returns binary audio directly. Gemini-native PCM is wrapped in a WAV container when `response_format` is `wav` (the default):

```bash
curl -X POST http://localhost:7860/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-3.1-flash-tts-preview",
    "input": "Hello, this is a text to speech test.",
    "voice": "Kore",
    "response_format": "wav"
  }' \
  --output speech.wav
```

Supported response formats are `wav` and `pcm`. The `pcm` option returns Gemini's raw PCM bytes with the sample format declared in the response `Content-Type`. MP3, AAC, FLAC, and Opus are not returned because this project does not include an audio encoder; requesting them returns an OpenAI-style `400` error. Unsupported speech parameters, including `speed`, `instructions`, `stream`, and `stream_format`, also return `400` instead of being silently ignored.

## ♊ Gemini Native API Format

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-flash-lite-latest:generateContent \
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
curl -X POST http://localhost:7860/v1beta/models/gemini-flash-lite-latest:streamGenerateContent?alt=sse \
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

### 🖼️ Generate Image [Official Docs](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-3.1-flash-lite-image:generateContent \
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
curl -X POST http://localhost:7860/v1beta/models/gemini-3.1-flash-lite-image:streamGenerateContent?alt=sse \
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

### 🎵 Lyria Music Generation [Official Docs](https://ai.google.dev/gemini-api/docs/generate-content/music-generation)

#### Generate a 30-Second Music Clip

```bash
curl -X POST http://localhost:7860/v1beta/models/lyria-3-clip-preview:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Create a 30-second cheerful acoustic folk song with guitar and harmonica."
          }
        ]
      }
    ]
  }'
```

#### Generate a Full-Length Song

```bash
curl -X POST http://localhost:7860/v1beta/models/lyria-3.5:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Create an epic cinematic orchestral piece about a journey home. Start with a solo piano, build through sweeping strings, and end with a powerful climax."
          }
        ]
      }
    ]
  }'
```

### 🎧 Audio Transcription [Official Docs](https://ai.google.dev/gemini-api/docs/generate-content/transcribe)

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-3.5-transcribe:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "fileData": {
              "fileUri": "YOUR_FILE_URI",
              "mimeType": "audio/mp3"
            }
          }
        ]
      }
    ]
  }'
```

### 🎤 TTS (Text-to-Speech) [Official Docs](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation)

#### Single-Speaker Speech

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-3.8-flash-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "Have a wonderful day!",
            "speech_metadata": {
              "style": "cheerful and friendly"
            }
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"],
      "speechConfig": {
        "voiceConfig": {
          "voice": "Kore"
        }
      }
    }
  }'
```

#### Multi-Speaker Dialogue

For multi-speaker dialogue, place each speaker's text in a separate `part` and match `speech_metadata.speaker` to the voice configuration.

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-3.8-flash-tts:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {
            "text": "How is it going today, Jane?",
            "speech_metadata": {
              "speaker": "Joe",
              "style": "cheerful and friendly"
            }
          },
          {
            "text": "Not too bad. How about you? Ready to test these new voices?",
            "speech_metadata": {
              "speaker": "Jane",
              "style": "calm and relaxed"
            }
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
                  "voiceName": "Puck"
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
    "model": "gemini-flash-lite-latest",
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
    "model": "gemini-flash-lite-latest",
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
