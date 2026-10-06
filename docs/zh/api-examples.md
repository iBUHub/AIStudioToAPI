# API 使用示例

本文档提供了简要的 API 使用示例，包括 OpenAI 兼容 API、Gemini 原生 API 和 Anthropic 兼容 API 格式。

## 🤖 OpenAI 兼容 API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-flash-lite-latest",
    "messages": [
      {
        "role": "user",
        "content": "你好，最近怎么样？"
      }
    ],
    "stream": false
  }'
```

### 🌊 使用流式响应

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-flash-lite-latest",
    "messages": [
      {
        "role": "user",
        "content": "写一首关于秋天的诗"
      }
    ],
    "stream": true
  }'
```

### 🖼️ 生成图片 [官方文档](https://ai.google.dev/gemini-api/docs/generate-content/image-generation?hl=zh-cn)

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-3.1-flash-lite-image",
    "messages": [
      {
        "role": "user",
        "content": "生成一只小猫"
      }
    ],
    "stream": false
  }'
```

#### 🫗 流式生成

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-3.1-flash-lite-image",
    "messages": [
      {
        "role": "user",
        "content": "生成一只小猫"
      }
    ],
    "stream": true
  }'
```

### 📐 文本嵌入 [官方文档](https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-cn)

```bash
curl -X POST http://localhost:7860/v1/embeddings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-embedding-001",
    "input": "什么是人工智能？"
  }'
```

### 💬 Responses API

```bash
curl -X POST http://localhost:7860/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-flash-lite-latest",
    "input": "请用三句话总结函数式编程的核心思想。",
    "stream": false
  }'
```

#### 🌊 流式 Responses API

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
            "text": "写一首关于秋天的短诗。"
          }
        ]
      }
    ],
    "stream": true
  }'
```

### 🎤 语音生成

OpenAI 兼容的语音端点会直接返回二进制音频。当 `response_format` 为 `wav`（默认值）时，服务会将 Gemini 原生 PCM 封装为 WAV：

```bash
curl -X POST http://localhost:7860/v1/audio/speech \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-3.1-flash-tts-preview",
    "input": "你好，这是一个语音合成测试。",
    "voice": "Kore",
    "response_format": "wav"
  }' \
  --output speech.wav
```

支持的响应格式为 `wav` 和 `pcm`。选择 `pcm` 时会返回 Gemini 的原始 PCM 字节，并在响应 `Content-Type` 中声明采样格式。本项目未包含音频编码器，因此不会返回 MP3、AAC、FLAC 或 Opus；请求这些格式时会返回 OpenAI 风格的 `400` 错误。不支持的语音参数（包括 `speed`、`instructions`、`stream` 和 `stream_format`）同样会返回 `400`，不会被静默忽略。

## ♊ Gemini 原生 API 格式

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
            "text": "你好，最近怎么样？"
          }
        ]
      }
    ]
  }'
```

### 🌊 使用流式响应

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
            "text": "写一首关于秋天的诗"
          }
        ]
      }
    ]
  }'
```

### 🖼️ 生成图片 [官方文档](https://ai.google.dev/gemini-api/docs/generate-content/image-generation?hl=zh-cn)

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
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

#### 🫗 流式生成

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
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

### 🎵 Lyria 音乐生成 [官方文档](https://ai.google.dev/gemini-api/docs/generate-content/music-generation?hl=zh-cn)

#### 生成 30 秒音乐片段

```bash
curl -X POST http://localhost:7860/v1beta/models/lyria-3-clip-preview:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "创作一首 30 秒的欢快原声民谣，使用吉他和口琴。"
          }
        ]
      }
    ]
  }'
```

#### 生成完整歌曲

```bash
curl -X POST http://localhost:7860/v1beta/models/lyria-3.5:generateContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "创作一首关于归途的史诗电影配乐，以钢琴独奏开场，逐渐加入弦乐，并在结尾达到高潮。"
          }
        ]
      }
    ]
  }'
```

### 🎧 音频转写 [官方文档](https://ai.google.dev/gemini-api/docs/generate-content/transcribe?hl=zh-cn)

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

### 🎤 TTS 语音合成 [官方文档](https://ai.google.dev/gemini-api/docs/generate-content/speech-generation?hl=zh-cn)

#### 单人语音

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
            "text": "祝你今天过得愉快！",
            "speech_metadata": {
              "style": "欢快且友好"
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

#### 多人对话

多人对话将每个说话者的内容放在独立的 `part` 中，并通过 `speech_metadata.speaker` 与声音配置对应。

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
            "text": "Jane，你今天过得怎么样？",
            "speech_metadata": {
              "speaker": "Joe",
              "style": "欢快且友好"
            }
          },
          {
            "text": "还不错，你呢？准备好测试这些新声音了吗？",
            "speech_metadata": {
              "speaker": "Jane",
              "style": "平静且放松"
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

### 📐 文本嵌入 (Embeddings) [官方文档](https://ai.google.dev/gemini-api/docs/embeddings?hl=zh-cn)

使用 `embedContent` 或 `batchEmbedContents` 端点生成文本嵌入向量。

#### 单个文本嵌入

```bash
curl -X POST http://localhost:7860/v1beta/models/gemini-embedding-001:embedContent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {
      "parts": [
        {
          "text": "什么是人工智能？"
        }
      ]
    }
  }'
```

#### 单条 batch 文本嵌入

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
              "text": "什么是人工智能？"
            }
          ]
        }
      }
    ]
  }'
```

#### 批量文本嵌入

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
              "text": "什么是人工智能？"
            }
          ]
        }
      },
      {
        "model": "models/gemini-embedding-001",
        "content": {
          "parts": [
            {
              "text": "机器学习和深度学习有什么区别？"
            }
          ]
        }
      }
    ]
  }'
```

## 👤 Anthropic 兼容 API

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
        "content": "你好，最近怎么样？"
      }
    ],
    "stream": false
  }'
```

### 🌊 使用流式响应

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
        "content": "写一首关于秋天的诗"
      }
    ],
    "stream": true
  }'
```
