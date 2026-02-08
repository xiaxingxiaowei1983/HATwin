/** 
 * 酒店投资分身 - 增强插件 (Sidecar)
 * 功能：Supabase认证 + PDF导出 + 分享裂变
 * 模式：非侵入式 DOM 注入
 */

// --- 1. 初始化配置 ---
// 请将以下值替换为您实际的 Supabase 项目配置
const SB_URL = 'https://lbnkspwgcblfbwbhxqda.supabase.co'; // 示例 Supabase URL
const SB_KEY = '*****************************************************************************************************************************************************************************************************************************'; // 示例 Supabase Anon Key

// 确保 window.supabase 可用
if (!window.supabase) {
    console.error('Supabase SDK 未加载，请检查 HTML 中的引用');
} else {
    const supabase = window.supabase.createClient(SB_URL, SB_KEY);
    // 将 supabase 实例暴露到全局，以便其他函数使用
    window.supabaseInstance = supabase;
}

// --- 2. UI 注入引擎 (不改动原HTML，动态插入按钮) ---
document.addEventListener('DOMContentLoaded', () => {
    injectToolbar();
    checkAuthAndShare();
});

function injectToolbar() {
    // 找到页面上的合适位置，比如右上角或侧边栏
    const toolbar = document.createElement('div');
    toolbar.className = 'fixed top-4 right-4 z-50 flex gap-2';
    toolbar.innerHTML = `
        <button id="btn-login" class="hidden px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow transition">
            <i class="fa fa-user"></i> 登录/注册
        </button>
        <button id="btn-export" class="hidden px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow transition">
            <i class="fa fa-file-pdf-o"></i> 导出报告
        </button>
        <button id="btn-share" class="hidden px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 shadow transition">
            <i class="fa fa-share-alt"></i> 分享底稿
        </button>
        <div id="user-info" class="hidden text-gray-700 font-bold self-center"></div>
    `;
    document.body.appendChild(toolbar);

    // 绑定事件
    document.getElementById('btn-login').onclick = handleLogin;
    document.getElementById('btn-export').onclick = handleExportPDF;
    document.getElementById('btn-share').onclick = handleShare;
    
    // 初始化用户对话计数
    window.userMessageCount = 0;
    
    // 监听用户输入事件
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        chatForm.addEventListener('submit', function() {
            window.userMessageCount++;
            if (window.userMessageCount >= 2) {
                // 显示登录按钮
                document.getElementById('btn-login').classList.remove('hidden');
            }
        });
    }
}

// --- 3. 核心功能逻辑 ---

// [功能 1] 身份认证 (Auth)
async function handleLogin() {
    const email = prompt("请输入邮箱接收登录链接 (Magic Link):");
    if (!email) return;
    
    if (!window.supabaseInstance) {
        alert('Supabase 未初始化，请检查配置');
        return;
    }
    
    const { error } = await window.supabaseInstance.auth.signInWithOtp({ email });
    if (error) alert('错误: ' + error.message);
    else alert('登录链接已发送至您的邮箱，请点击登录！');
}

async function checkAuthAndShare() {
    // 检查是否有分享链接
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share_id');

    if (shareId) {
        // [PLG 增长逻辑] 如果是分享链接，进入"只读模式"
        loadSharedConversation(shareId);
        return;
    }

    // 检查用户登录状态
    if (window.supabaseInstance) {
        const { data: { session } } = await window.supabaseInstance.auth.getSession();
        if (session) {
            updateUIState(session.user);
        }
    }
}

function updateUIState(user) {
    document.getElementById('btn-login').style.display = 'none';
    document.getElementById('btn-export').classList.remove('hidden');
    document.getElementById('btn-share').classList.remove('hidden');
    
    const userInfo = document.getElementById('user-info');
    userInfo.classList.remove('hidden');
    userInfo.innerText = user.email.split('@')[0]; // 显示用户名
}

// [功能 2] 导出 PDF (JTBD: 决策支持)
function handleExportPDF() {
    // 获取聊天记录容器 (请根据你现有的 DOM ID 修改选择器，假设是 #chat-container)
    const element = document.querySelector('main') || document.body;
    
    const opt = {
        margin:       10,
        filename:     '酒店投资可行性分析报告.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // 这是一个"价值转换"的过程：从网页变为资产
    html2pdf().set(opt).from(element).save();
}

// [功能 3] 分享底稿 (PLG: 病毒传播)
async function handleShare() {
    if (!window.supabaseInstance) {
        alert('Supabase 未初始化，请检查配置');
        return;
    }

    const { data: { user } } = await window.supabaseInstance.auth.getUser();
    if (!user) return alert('请先登录');

    // 1. 获取当前对话内容 (假设你的对话存在某个变量里，或者从 DOM 读取)
    // 这里需要你适配一下：如何从你的原生 JS 中获取当前的对话数组
    // 假设 globalChatHistory 是你存储对话的变量
    const currentContent = window.globalChatHistory || [];

    if (currentContent.length === 0) return alert('当前没有对话内容可分享');

    // 2. 存入 Supabase
    const { data, error } = await window.supabaseInstance
        .from('conversations')
        .insert([
            {
                user_id: user.id,
                content: currentContent,
                is_public: true, // 关键：设为公开
                title: '未命名酒店投资分析'
            }
        ])
        .select()
        .single();

    if (error) {
        alert('分享失败: ' + error.message);
    } else {
        const shareUrl = `${window.location.origin}${window.location.pathname}?share_id=${data.id}`;
        // 复制到剪贴板
        navigator.clipboard.writeText(shareUrl);
        alert('分享链接已复制！发送给伙伴即可查看底稿。\n' + shareUrl);
    }
}

// [功能 3.1] 加载分享内容
async function loadSharedConversation(id) {
    if (!window.supabaseInstance) {
        alert('Supabase 未初始化，请检查配置');
        return;
    }

    const { data, error } = await window.supabaseInstance
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        alert('无法加载该分享内容或链接已失效');
    } else {
        alert('正在查看分享的底稿模式 (只读)');
        // 这里调用你原有的渲染函数，把 data.content 画到屏幕上
        // renderChat(data.content);
        
        // 并在界面上显示一个醒目的"我也要创建"按钮 (PLG 转化钩子)
        showCallToAction();
    }
}

function showCallToAction() {
    const cta = document.createElement('div');
    cta.className = 'fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg cursor-pointer animate-bounce';
    cta.innerHTML = '🚀 基于此底稿创建我的分析';
    cta.onclick = () => { window.location.href = window.location.pathname; }; // 去掉参数重载
    document.body.appendChild(cta);
}
