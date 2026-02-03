# API 使用示例

本文档提供了简要的 API 使用示例，包括 OpenAI 兼容 API、Anthropic 兼容 API 和 Gemini 原生 API 格式。

## 🤖 OpenAI 兼容 API

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-lite",
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
    "model": "gemini-2.5-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "写一首关于秋天的诗"
      }
    ],
    "stream": true
  }'
```

### 🖼️ 生成图片 [官方文档](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn)

```bash
curl -X POST http://localhost:7860/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "model": "gemini-2.5-flash-image",
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
    "model": "gemini-2.5-flash-image",
    "messages": [
      {
        "role": "user",
        "content": "生成一只小猫"
      }
    ],
    "stream": true
  }'
```

## ♊ Gemini 原生 API 格式

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
            "text": "你好，最近怎么样？"
          }
        ]
      }
    ]
  }'
```

### 🌊 使用流式响应

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
            "text": "写一首关于秋天的诗"
          }
        ]
      }
    ]
  }'
```

### 🖼️ 生成图片 [官方文档](https://ai.google.dev/gemini-api/docs/image-generation?hl=zh-cn)

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
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

#### 🫗 流式生成

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
            "text": "生成一只小猫"
          }
        ]
      }
    ]
  }'
```

### 🎨 Imagen 图像生成 [官方文档](https://ai.google.dev/gemini-api/docs/imagen?hl=zh-cn)

使用 `imagen` 系列模型通过 `:predict` 端点生成图像。

#### 基础图像生成

```bash
curl -X POST http://localhost:7860/v1beta/models/imagen-4.0-generate-001:predict \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "instances": [
      {
        "prompt": "机器人手持红色滑板"
      }
    ],
    "parameters": {
      "sampleCount": 1
    }
  }'
```

#### 批量生成多张图像

调整 `sampleCount` 可一次生成多张图像（最多 4 张）。

```bash
curl -X POST http://localhost:7860/v1beta/models/imagen-4.0-generate-001:predict \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key-1" \
  -d '{
    "instances": [
      {
        "prompt": "夕阳下的未来城市，天空中有飞行汽车"
      }
    ],
    "parameters": {
      "sampleCount": 4
    }
  }'
```

> 💡 **提示**：Imagen 响应返回的是 base64 编码的图像数据，每张生成的图像都会包含在 `predictions` 数组中。

### 🎤 TTS 语音合成 [官方文档](https://ai.google.dev/gemini-api/docs/speech-generation?hl=zh-cn)

#### 基础 TTS（默认声音）

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
            "text": "你好，这是一个语音合成测试。"
          }
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["AUDIO"]
    }
  }'
```

#### 指定声音

可选声音：`Kore`、`Puck`、`Charon`、`Fenrir`、`Aoede`

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
            "text": "你好，这是一个语音合成测试。"
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

#### 多人对话

对话内容写在 prompt 中，使用 `multiSpeakerVoiceConfig` 配置多个说话者的声音（最多 2 个）。

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

> 💡 **提示**：TTS 响应返回的是 `audio/L16;codec=pcm;rate=24000` 格式的 base64 编码音频数据，需要解码后转换为 WAV 格式播放。

### 📐 文本嵌入 (Embeddings)

使用 `batchEmbedContents` 端点生成文本嵌入向量。

> ⚠️ **注意**：`embedContent` 端点已不再支持，请使用 `batchEmbedContents` 端点。

#### 单个文本嵌入

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
    "model": "gemini-2.5-flash-lite",
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
    "model": "gemini-2.5-flash-lite",
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
