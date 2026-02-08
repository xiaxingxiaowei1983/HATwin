const express = require('express');
const cors = require('cors');
require('dotenv').config(); // 加载 .env 文件中的变量
const fetch = require('node-fetch');

// 导入对话管理模块
const { createClient } = require('@supabase/supabase-js');

// 初始化 Supabase 客户端
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
let isSupabaseConfigured = false;

if (supabaseUrl && supabaseKey && supabaseUrl !== 'your_supabase_url_here' && supabaseKey !== 'your_supabase_service_role_key_here') {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    isSupabaseConfigured = true;
    console.log('Supabase client initialized successfully');
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    isSupabaseConfigured = false;
  }
} else {
  console.warn('Supabase not configured. Using in-memory storage for testing.');
  isSupabaseConfigured = false;
}

// 内存存储实现（用于测试）
let inMemoryConversations = [];
let nextId = 1;

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

        // 火山方舟豆包API配置
        const apiUrl = process.env.VOLCANO_API_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
        const endpointId = process.env.ENDPOINT_ID || 'ep-20260206172400-7kjf6';
        
        // 检查密钥是否存在
        console.log('检查API密钥:', process.env.VOLCANO_API_KEY ? '存在' : '不存在');
        console.log('API密钥长度:', process.env.VOLCANO_API_KEY ? process.env.VOLCANO_API_KEY.length : 0);
        
        // 简化条件检查，只要不是实际的API密钥就返回默认响应
        if (!process.env.VOLCANO_API_KEY || process.env.VOLCANO_API_KEY === 'your_volcano_api_key_here' || process.env.VOLCANO_API_KEY === '*****************************************************************************************************************************************************************************************************************************') {
            // 如果API密钥未配置或使用的是占位符，返回默认响应
            console.log('API密钥未配置或使用的是占位符，返回默认响应');
            return res.json({ 
                text: '您好，我是LAY，您的酒店投资风控参谋。由于系统API未配置，我将使用默认模式为您提供服务。请告诉我您的投资意向，例如城市、预算、酒店类型等信息，我将为您分析投资风险并提供专业建议。' 
            });
        }
        
        console.log('使用实际API密钥调用API');
        console.log('API端点:', apiUrl);
        console.log('模型ID:', endpointId);

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

        // 错误处理：如果API返回错误，返回默认响应
        if (!response.ok) {
            console.error('API调用失败:', response.status, data);
            return res.json({ 
                text: '您好，我是LAY，您的酒店投资风控参谋。由于API调用失败，我将使用默认模式为您提供服务。请告诉我您的投资意向，例如城市、预算、酒店类型等信息，我将为您分析投资风险并提供专业建议。' 
            });
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
        // 捕获到错误时，返回默认响应
        res.json({ 
            text: '您好，我是LAY，您的酒店投资风控参谋。由于系统错误，我将使用默认模式为您提供服务。请告诉我您的投资意向，例如城市、预算、酒店类型等信息，我将为您分析投资风险并提供专业建议。' 
        });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'LAY AI Proxy Server is running' });
});

// 对话管理 API 端点

// 创建新对话
app.post('/api/conversations', async (req, res) => {
    try {
        const { user_id, title, content, is_public } = req.body;

        // 验证必要参数
        if (!user_id) {
            return res.status(400).json({ error: '缺少 user_id 参数' });
        }

        if (isSupabaseConfigured && supabase) {
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .insert({
                        user_id,
                        title,
                        content: content || {},
                        is_public: is_public || false
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('Supabase插入失败，切换到内存存储:', error.message);
                    // 如果插入失败，切换到内存存储
                    const newConversation = {
                        id: `local-${nextId++}`,
                        created_at: new Date().toISOString(),
                        user_id,
                        title,
                        content: content || {},
                        is_public: is_public || false
                    };
                    inMemoryConversations.push(newConversation);
                    res.status(201).json(newConversation);
                } else {
                    res.status(201).json(data);
                }
            } catch (error) {
                console.error('Supabase操作失败，切换到内存存储:', error.message);
                // 如果操作失败，切换到内存存储
                const newConversation = {
                    id: `local-${nextId++}`,
                    created_at: new Date().toISOString(),
                    user_id,
                    title,
                    content: content || {},
                    is_public: is_public || false
                };
                inMemoryConversations.push(newConversation);
                res.status(201).json(newConversation);
            }
        } else {
            // 使用内存存储
            const newConversation = {
                id: `local-${nextId++}`,
                created_at: new Date().toISOString(),
                user_id,
                title,
                content: content || {},
                is_public: is_public || false
            };
            inMemoryConversations.push(newConversation);
            res.status(201).json(newConversation);
        }
    } catch (error) {
        console.error('创建对话失败:', error);
        res.status(500).json({ error: '创建对话失败', details: error.message });
    }
});

// 获取对话列表
app.get('/api/conversations', async (req, res) => {
    try {
        const { user_id, public_only } = req.query;

        if (public_only === 'true') {
            // 获取公开对话
            if (isSupabaseConfigured && supabase) {
                try {
                    const { data, error } = await supabase
                        .from('conversations')
                        .select()
                        .eq('is_public', true);

                    if (error) {
                        console.error('Supabase查询失败，切换到内存存储:', error.message);
                        // 如果查询失败，切换到内存存储
                        const publicConversations = inMemoryConversations.filter(c => c.is_public === true);
                        res.json(publicConversations);
                    } else {
                        res.json(data);
                    }
                } catch (error) {
                    console.error('Supabase操作失败，切换到内存存储:', error.message);
                    // 如果操作失败，切换到内存存储
                    const publicConversations = inMemoryConversations.filter(c => c.is_public === true);
                    res.json(publicConversations);
                }
            } else {
                // 使用内存存储
                const publicConversations = inMemoryConversations.filter(c => c.is_public === true);
                res.json(publicConversations);
            }
        } else if (user_id) {
            // 获取用户对话
            if (isSupabaseConfigured && supabase) {
                try {
                    const { data, error } = await supabase
                        .from('conversations')
                        .select()
                        .eq('user_id', user_id);

                    if (error) {
                        console.error('Supabase查询失败，切换到内存存储:', error.message);
                        // 如果查询失败，切换到内存存储
                        const userConversations = inMemoryConversations.filter(c => c.user_id === user_id);
                        res.json(userConversations);
                    } else {
                        res.json(data);
                    }
                } catch (error) {
                    console.error('Supabase操作失败，切换到内存存储:', error.message);
                    // 如果操作失败，切换到内存存储
                    const userConversations = inMemoryConversations.filter(c => c.user_id === user_id);
                    res.json(userConversations);
                }
            } else {
                // 使用内存存储
                const userConversations = inMemoryConversations.filter(c => c.user_id === user_id);
                res.json(userConversations);
            }
        } else {
            return res.status(400).json({ error: '必须提供 user_id 或设置 public_only=true' });
        }
    } catch (error) {
        console.error('获取对话列表失败:', error);
        res.status(500).json({ error: '获取对话列表失败', details: error.message });
    }
});

// 获取单个对话详情
app.get('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (isSupabaseConfigured && supabase) {
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .select()
                    .eq('id', id)
                    .single();

                if (error) {
                    console.error('Supabase查询失败，切换到内存存储:', error.message);
                    // 如果查询失败，切换到内存存储
                    const conversation = inMemoryConversations.find(c => c.id === id);
                    if (!conversation) {
                        return res.status(404).json({ error: '对话不存在' });
                    }
                    res.json(conversation);
                } else {
                    res.json(data);
                }
            } catch (error) {
                console.error('Supabase操作失败，切换到内存存储:', error.message);
                // 如果操作失败，切换到内存存储
                const conversation = inMemoryConversations.find(c => c.id === id);
                if (!conversation) {
                    return res.status(404).json({ error: '对话不存在' });
                }
                res.json(conversation);
            }
        } else {
            // 使用内存存储
            const conversation = inMemoryConversations.find(c => c.id === id);
            if (!conversation) {
                return res.status(404).json({ error: '对话不存在' });
            }
            res.json(conversation);
        }
    } catch (error) {
        console.error('获取对话详情失败:', error);
        res.status(500).json({ error: '获取对话详情失败', details: error.message });
    }
});

// 更新对话
app.put('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        if (isSupabaseConfigured && supabase) {
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .update(updates)
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    console.error('Supabase更新失败，切换到内存存储:', error.message);
                    // 如果更新失败，切换到内存存储
                    const index = inMemoryConversations.findIndex(c => c.id === id);
                    if (index === -1) {
                        return res.status(404).json({ error: '对话不存在' });
                    }

                    inMemoryConversations[index] = { ...inMemoryConversations[index], ...updates };
                    res.json(inMemoryConversations[index]);
                } else {
                    res.json(data);
                }
            } catch (error) {
                console.error('Supabase操作失败，切换到内存存储:', error.message);
                // 如果操作失败，切换到内存存储
                const index = inMemoryConversations.findIndex(c => c.id === id);
                if (index === -1) {
                    return res.status(404).json({ error: '对话不存在' });
                }

                inMemoryConversations[index] = { ...inMemoryConversations[index], ...updates };
                res.json(inMemoryConversations[index]);
            }
        } else {
            // 使用内存存储
            const index = inMemoryConversations.findIndex(c => c.id === id);
            if (index === -1) {
                return res.status(404).json({ error: '对话不存在' });
            }

            inMemoryConversations[index] = { ...inMemoryConversations[index], ...updates };
            res.json(inMemoryConversations[index]);
        }
    } catch (error) {
        console.error('更新对话失败:', error);
        res.status(500).json({ error: '更新对话失败', details: error.message });
    }
});

// 标记对话为公开
app.put('/api/conversations/:id/public', async (req, res) => {
    try {
        const { id } = req.params;

        if (isSupabaseConfigured && supabase) {
            try {
                const { data, error } = await supabase
                    .from('conversations')
                    .update({ is_public: true })
                    .eq('id', id)
                    .select()
                    .single();

                if (error) {
                    console.error('Supabase更新失败，切换到内存存储:', error.message);
                    // 如果更新失败，切换到内存存储
                    const index = inMemoryConversations.findIndex(c => c.id === id);
                    if (index === -1) {
                        return res.status(404).json({ error: '对话不存在' });
                    }

                    inMemoryConversations[index].is_public = true;
                    res.json(inMemoryConversations[index]);
                } else {
                    res.json(data);
                }
            } catch (error) {
                console.error('Supabase操作失败，切换到内存存储:', error.message);
                // 如果操作失败，切换到内存存储
                const index = inMemoryConversations.findIndex(c => c.id === id);
                if (index === -1) {
                    return res.status(404).json({ error: '对话不存在' });
                }

                inMemoryConversations[index].is_public = true;
                res.json(inMemoryConversations[index]);
            }
        } else {
            // 使用内存存储
            const index = inMemoryConversations.findIndex(c => c.id === id);
            if (index === -1) {
                return res.status(404).json({ error: '对话不存在' });
            }

            inMemoryConversations[index].is_public = true;
            res.json(inMemoryConversations[index]);
        }
    } catch (error) {
        console.error('标记对话为公开失败:', error);
        res.status(500).json({ error: '标记对话为公开失败', details: error.message });
    }
});

// 删除对话
app.delete('/api/conversations/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (isSupabaseConfigured && supabase) {
            try {
                const { error } = await supabase
                    .from('conversations')
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.error('Supabase删除失败，切换到内存存储:', error.message);
                    // 如果删除失败，切换到内存存储
                    const index = inMemoryConversations.findIndex(c => c.id === id);
                    if (index === -1) {
                        return res.status(404).json({ error: '对话不存在' });
                    }

                    inMemoryConversations.splice(index, 1);
                    res.json({ success: true, message: '对话删除成功' });
                } else {
                    res.json({ success: true, message: '对话删除成功' });
                }
            } catch (error) {
                console.error('Supabase操作失败，切换到内存存储:', error.message);
                // 如果操作失败，切换到内存存储
                const index = inMemoryConversations.findIndex(c => c.id === id);
                if (index === -1) {
                    return res.status(404).json({ error: '对话不存在' });
                }

                inMemoryConversations.splice(index, 1);
                res.json({ success: true, message: '对话删除成功' });
            }
        } else {
            // 使用内存存储
            const index = inMemoryConversations.findIndex(c => c.id === id);
            if (index === -1) {
                return res.status(404).json({ error: '对话不存在' });
            }

            inMemoryConversations.splice(index, 1);
            res.json({ success: true, message: '对话删除成功' });
        }
    } catch (error) {
        console.error('删除对话失败:', error);
        res.status(500).json({ error: '删除对话失败', details: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`代理服务器已启动：http://localhost:${PORT}`);
});
