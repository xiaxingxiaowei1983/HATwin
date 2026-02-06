const express = require('express');
const cors = require('cors');
require('dotenv').config(); // 加载 .env 文件中的变量
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// 允许跨域请求（允许你的前端网页访问这个后端）
app.use(cors());
app.use(express.json());

// 代理接口：接收前端的prompt，转发给火山方舟豆包API
app.post('/api/chat', async (req, res) => {
    try {
        const { prompt } = req.body;

        // 检查prompt是否存在
        if (!prompt) {
            return res.status(400).json({ error: '缺少prompt参数' });
        }

        // 检查密钥是否存在
        if (!process.env.VOLCANO_API_KEY) {
            throw new Error('服务器端未配置API Key');
        }

        // 火山方舟豆包API配置
        const apiUrl = process.env.VOLCANO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
        const endpointId = process.env.ENDPOINT_ID || 'ep-20260206172400-7kjf6';

        // 构建请求体
        const requestBody = {
            model: endpointId,  // 使用接入点ID作为model参数
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            stream: false
        };

        // 发送请求到火山方舟豆包API
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.VOLCANO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        // 错误处理：如果API返回错误，将其透传给前端方便调试
        if (!response.ok) {
            console.error('API调用失败:', response.status, data);
            return res.status(response.status).json({ error: data.message || 'API调用失败' });
        }

        // 提取回复内容发送回前端
        if (data.choices && data.choices.length > 0) {
            const message = data.choices[0].message;
            if (message && message.content) {
                res.json({ text: message.content });
            } else {
                res.json({ text: 'AI未返回有效响应' });
            }
        } else {
            res.json({ text: 'AI未返回有效响应' });
        }

    } catch (error) {
        console.error('服务器内部错误:', error);
        res.status(500).json({ error: '服务器内部处理出错' });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'LAY AI Proxy Server is running' });
});

app.listen(PORT, () => {
    console.log(`代理服务器已启动：http://localhost:${PORT}`);
});
