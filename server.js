require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置代理支持
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');

// 尝试检测系统代理或使用环境变量中的代理
let agent = null;
// const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY ||
//                  process.env.http_proxy || process.env.https_proxy ||
//                  'http://127.0.0.1:10808'; // 常见的代理端口

// try {
//     agent = new HttpsProxyAgent(proxyUrl);
//     console.log('使用代理:', proxyUrl);
// } catch (error) {
//     console.log('代理配置失败，使用直接连接:', error.message);
// }

const app = express();
const PORT = process.env.PORT || 3000;

// 配置CORS
const cors = require('cors');
app.use(cors({
    origin: true, // 允许所有origin
    credentials: true
}));

// 用户数据 - 新结构：地址数组、余额数组、合计、百分比
// 基础数据源（从 users.json 加载，不会被缓存覆盖）
const baseUsers = require('./users.json');
// 运行时数据（可能包含缓存数据）
let users = [...baseUsers];

// DOG代币合约地址
const DOG_CONTRACT = '0x903358faf7c6304afbd560e9e29b12ab1b8fddc5';

// OKX API配置 - 请在.env文件中设置环境变量
const OKX_CONFIG = {
    apiKey: process.env.OKX_API_KEY,
    apiSecret: process.env.OKX_API_SECRET,
    apiPassphrase: process.env.OKX_API_PASSPHRASE,
    chainIndex: '196'
};

// 检查API配置
if (!OKX_CONFIG.apiKey || !OKX_CONFIG.apiSecret || !OKX_CONFIG.apiPassphrase) {
    console.error('请在.env文件中配置OKX API凭证:');
    console.error('OKX_API_KEY=your_api_key_here');
    console.error('OKX_API_SECRET=your_api_secret_here');
    console.error('OKX_API_PASSPHRASE=your_passphrase_here');
    process.exit(1);
}

// 缓存数据
let balanceCache = {};
let lastUpdateTime = null;
let isUpdating = false;

// 缓存文件路径
const CACHE_FILE = path.join(__dirname, 'balance-cache.json');

// 从文件加载缓存数据
function loadCacheFromFile() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            balanceCache = cacheData.balanceCache || {};
            lastUpdateTime = cacheData.lastUpdateTime || null;
            
            // 从缓存恢复运行时数据，但以 users.json 为准
            if (cacheData.users && Array.isArray(cacheData.users)) {
                // 创建缓存用户映射
                const cachedUserMap = new Map();
                cacheData.users.forEach(cachedUser => {
                    cachedUserMap.set(cachedUser.nickname, cachedUser);
                });
                
                // 基于 users.json 重建 users 数组，并恢复缓存中的运行时数据
                users = baseUsers.map(baseUser => {
                    const cachedUser = cachedUserMap.get(baseUser.nickname);
                    if (cachedUser) {
                        // 恢复运行时数据，但保留 users.json 中的基础数据
                        return {
                            ...baseUser,
                            currentBalances: cachedUser.currentBalances || [],
                            totalBalance: cachedUser.totalBalance || 0,
                            percentage: cachedUser.percentage || 0
                        };
                    } else {
                        // 新用户，使用默认值
                        return {
                            ...baseUser,
                            currentBalances: [],
                            totalBalance: 0,
                            percentage: 0
                        };
                    }
                });
                
                console.log(`✅ 已从文件加载缓存数据，最后更新时间: ${lastUpdateTime || '未知'}`);
                console.log(`   缓存地址数: ${Object.keys(balanceCache).length}`);
                console.log(`   用户数据: ${users.length} 个用户（基于 users.json）`);
            } else {
                // 没有缓存，使用 users.json 的基础数据
                users = baseUsers.map(user => ({
                    ...user,
                    currentBalances: [],
                    totalBalance: 0,
                    percentage: 0
                }));
                console.log(`✅ 已从文件加载缓存数据，最后更新时间: ${lastUpdateTime || '未知'}`);
                console.log(`   缓存地址数: ${Object.keys(balanceCache).length}`);
                console.log(`   ⚠️  缓存文件中没有用户数据，使用 users.json 中的基础数据`);
            }
            return true;
        } else {
            console.log('📝 缓存文件不存在，将创建新缓存');
            return false;
        }
    } catch (error) {
        console.error('❌ 加载缓存文件失败:', error.message);
        return false;
    }
}

// 保存缓存数据到文件
function saveCacheToFile() {
    try {
        const cacheData = {
            balanceCache: balanceCache,
            lastUpdateTime: lastUpdateTime,
            users: users, // 直接保存完整的 users 数组
            savedAt: new Date().toISOString()
        };
        
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
        console.log(`💾 缓存数据已保存到文件: ${CACHE_FILE}`);
    } catch (error) {
        console.error('❌ 保存缓存文件失败:', error.message);
    }
}

// 创建OKX API签名
function createSignature(method, requestPath, body = '') {
    const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
    const message = timestamp + method + requestPath + body;

    const hmac = crypto.createHmac('sha256', OKX_CONFIG.apiSecret);
    hmac.update(message);
    const signature = hmac.digest('base64');

    return { signature, timestamp };
}

// 获取单个地址的余额
async function getTokenBalance(address, tokenContractAddress, retryCount = 0) {
    const maxRetries = 3;
    const requestBody = {
        address: address,
        tokenContractAddresses: [{
            chainIndex: OKX_CONFIG.chainIndex,
            tokenContractAddress: tokenContractAddress
        }]
    };

    try {
        const { signature, timestamp } = createSignature('POST', '/api/v6/dex/balance/token-balances-by-address', JSON.stringify(requestBody));

        const response = await fetch('https://web3.okx.com/api/v6/dex/balance/token-balances-by-address', {
            method: 'POST',
            headers: {
                'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': OKX_CONFIG.apiPassphrase,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            agent: agent // 使用代理
        });

        const result = await response.json();

        if (result.code !== '0') {
            throw new Error(`OKX API错误: ${result.msg || '未知错误'}`);
        }

        if (result.data && result.data.length > 0 && result.data[0].tokenAssets && result.data[0].tokenAssets.length > 0) {
            const tokenAsset = result.data[0].tokenAssets[0];
            return {
                balance: parseFloat(tokenAsset.balance),
                rawBalance: tokenAsset.rawBalance || '0',
                symbol: tokenAsset.symbol || 'DOG'
            };
        }

        return { balance: 0, rawBalance: '0', symbol: 'DOG' };

    } catch (error) {
        console.error(`获取地址 ${address} 余额失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

        if (retryCount < maxRetries) {
            // 等待1.5秒后重试
            await new Promise(resolve => setTimeout(resolve, 1500));
            return getTokenBalance(address, tokenContractAddress, retryCount + 1);
        }

        // 达到最大重试次数，返回失败结果
        return { balance: 0, rawBalance: '0', symbol: 'DOG', error: error.message };
    }
}

// 更新所有余额数据
async function updateAllBalances() {
    if (isUpdating) {
        console.log('已有更新任务进行中，跳过此次更新');
        return;
    }

    console.log('开始更新所有余额数据...');
    console.log('📋 使用 users.json 作为数据源');
    isUpdating = true;
    const startTime = Date.now();

    try {
        // 重新从 users.json 加载基础数据，确保使用最新的用户列表
        // 清除 require 缓存，强制重新加载
        delete require.cache[require.resolve('./users.json')];
        const currentBaseUsers = require('./users.json');
        
        // 如果 users.json 有更新，同步到 users 数组
        if (currentBaseUsers.length !== baseUsers.length) {
            console.log(`⚠️  检测到 users.json 有变化，用户数量: ${baseUsers.length} -> ${currentBaseUsers.length}`);
        }
        
        const newCache = {};
        
        // 保存当前的 users 数组（用于恢复运行时数据）
        const previousUsers = [...users];
        const previousUserMap = new Map();
        previousUsers.forEach(u => previousUserMap.set(u.nickname, u));
        
        // 基于 users.json 重建 users 数组，确保地址和初始余额是最新的
        users = currentBaseUsers.map(baseUser => {
            // 查找之前 users 数组中对应的用户（用于保留运行时数据）
            const existingUser = previousUserMap.get(baseUser.nickname);
            if (existingUser) {
                // 保留运行时数据，但更新基础数据（地址和初始余额）
                return {
                    ...baseUser,
                    currentBalances: existingUser.currentBalances || [],
                    totalBalance: existingUser.totalBalance || 0,
                    percentage: existingUser.percentage || 0
                };
            } else {
                // 新用户，使用默认值
                return {
                    ...baseUser,
                    currentBalances: [],
                    totalBalance: 0,
                    percentage: 0
                };
            }
        });

        // 使用 users.json 中的数据作为数据源
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            let totalBalance = 0;
            const addressBalances = [];

            // 为每个用户的每个地址获取余额
            for (let j = 0; j < user.addresses.length; j++) {
                const address = user.addresses[j];
                console.log(`正在获取 ${user.nickname} (${address.slice(0, 6)}...${address.slice(-4)}) 的余额...`);

                const balanceData = await getTokenBalance(address, DOG_CONTRACT);
                const balance = balanceData.balance || 0;
                totalBalance += balance;
                addressBalances.push(balance);

                // 缓存每个地址的结果
                newCache[address] = {
                ...balanceData,
                nickname: user.nickname,
                    address: address,
                    initialBalanceTotal: user.initialBalanceTotal,
                lastUpdate: new Date().toISOString()
            };

                // 每个地址请求之间等待500ms
                if (j < user.addresses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 更新用户数据
            user.currentBalances = addressBalances;
            user.totalBalance = totalBalance;
            user.percentage = user.initialBalanceTotal > 0 ? ((totalBalance - user.initialBalanceTotal) / user.initialBalanceTotal) * 100 : 0;

            console.log(`${user.nickname} 总余额: ${totalBalance.toLocaleString()}, 百分比: ${user.percentage.toFixed(2)}%`);

            // 每个用户之间等待1秒
            if (i < users.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 更新缓存
        balanceCache = newCache;
        lastUpdateTime = new Date().toISOString();

        // 保存到文件
        saveCacheToFile();

        const duration = Math.round((Date.now() - startTime) / 1000);
        const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);
        console.log(`余额数据更新完成，耗时 ${duration} 秒，共处理 ${users.length} 个用户，${totalAddresses} 个地址`);

    } catch (error) {
        console.error('批量更新余额失败:', error);
    } finally {
        isUpdating = false;
    }
}

// 启动定时任务 - 每10分钟更新一次
function startScheduledUpdates() {
    console.log('启动定时更新任务 - 每10分钟更新一次');

    // 立即执行一次
    updateAllBalances();

    // 设置定时器，每10分钟执行一次
    setInterval(() => {
        updateAllBalances();
    }, 10 * 60 * 1000); // 10分钟 = 10 * 60 * 1000 毫秒
}

// API路由
app.use(express.json());

// 获取余额数据API
app.get('/api/balances', (req, res) => {
    const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);

    // 检查是否是JSONP请求
    const callback = req.query.callback;
    const responseData = {
        success: true,
        data: {
            users: users,
            lastUpdate: lastUpdateTime,
            totalUsers: users.length,
            totalAddresses: totalAddresses,
            cachedAddresses: Object.keys(balanceCache).length
        }
    };

    if (callback) {
        // JSONP响应
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`${callback}(${JSON.stringify(responseData)});`);
    } else {
        // 普通JSON响应
        res.json(responseData);
    }
});

// 获取状态信息API
app.get('/api/status', (req, res) => {
    const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);
    res.json({
        success: true,
        data: {
            isUpdating,
            lastUpdateTime,
            totalUsers: users.length,
            totalAddresses: totalAddresses,
            cachedAddresses: Object.keys(balanceCache).length
        }
    });
});

// 手动触发更新API
app.post('/api/update', async (req, res) => {
    try {
        await updateAllBalances();
        res.json({
            success: true,
            message: '余额更新完成'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '更新失败',
            error: error.message
        });
    }
});

// 启动HTTP服务器
app.listen(PORT, () => {
    console.log(`DOG余额监控服务器运行在端口 ${PORT}`);
    console.log(`API地址: http://localhost:${PORT}`);
    
    // 启动时加载缓存
    loadCacheFromFile();
});

// 尝试启动HTTPS服务器
const httpsPort = 3443;
try {
    const sslKeyPath = path.join(__dirname, '148.135.52.253-key.pem');
    const sslCertPath = path.join(__dirname, '148.135.52.253.pem');

    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const https = require('https');
        const httpsOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
        };

        const httpsServer = https.createServer(httpsOptions, app);
        httpsServer.listen(httpsPort, '0.0.0.0', () => {
            console.log(`HTTPS服务器运行在端口 ${httpsPort}`);
            console.log(`HTTPS API地址: https://148.135.52.253:${httpsPort}`);
        });

        // 在HTTPS服务器启动后启动定时更新任务
        startScheduledUpdates();
    } else {
        console.log('SSL证书文件不存在，使用HTTP模式');
        console.log('如需HTTPS，请运行以下命令生成证书：');
        console.log('npm install -g mkcert');
        console.log('mkcert -install');
        console.log('mkcert 148.135.52.253');

        // HTTP模式下也启动定时更新任务
        startScheduledUpdates();
    }
} catch (error) {
    console.error('HTTPS服务器启动失败:', error.message);
    console.log('将继续使用HTTP模式');

    // 出错时也启动定时更新任务
    startScheduledUpdates();
}

// 如果HTTP服务器先启动，确保加载缓存
if (!fs.existsSync(CACHE_FILE)) {
    console.log('⚠️  首次启动，缓存文件不存在，将在首次更新后创建');
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    process.exit(0);
});
