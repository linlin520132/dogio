require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');
const { calculateUserPoolDOGHoldings } = require('./balance-utils');

// 读取配置文件和用户数据
const usersData = JSON.parse(fs.readFileSync('users.json', 'utf8'));

// DOG代币合约地址
const DOG_CONTRACT = '0x903358faf7c6304afbd560e9e29b12ab1b8fddc5';

// 从环境变量读取配置，如果没有则使用默认值
const CONFIG = {
    // API配置 - 支持环境变量
    API_KEY: process.env.OKX_API_KEY,
    SECRET_KEY: process.env.OKX_API_SECRET,
    PASSPHRASE: process.env.OKX_API_PASSPHRASE,
    POOL_ADDRESS: '0x41027D3CaCc14F35Abd387B7350c05247e9Ac646', // 池子地址

    // Proxy配置 - 在工作流中默认启用代理
    USE_PROXY: process.env.USE_PROXY === 'true', // 环境变量可以设置为'false'来禁用代理
    PROXY_URL: process.env.PROXY_URL || 'socks5://127.0.0.1:10808',
    PROXY_TYPE: process.env.PROXY_TYPE || 'socks5'
};

// 生成API签名
function generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    const signature = crypto.createHmac('sha256', CONFIG.SECRET_KEY)
        .update(message)
        .digest('base64');
    return signature;
}

// 创建代理agent
function createProxyAgent() {
    if (!CONFIG.USE_PROXY) {
        return null;
    }

    try {
        console.log(`使用代理: ${CONFIG.PROXY_URL} (类型: ${CONFIG.PROXY_TYPE})`);

        let agent;
        if (CONFIG.PROXY_TYPE === 'socks5') {
            agent = new SocksProxyAgent(CONFIG.PROXY_URL);
        } else {
            // http/https代理
            agent = new HttpsProxyAgent(CONFIG.PROXY_URL);
        }

        console.log(`✅ 代理Agent创建成功: ${agent.constructor.name}`);
        return agent;
    } catch (error) {
        console.error('\n❌ 创建代理失败:');
        console.error(`错误类型: ${error.constructor.name}`);
        console.error(`错误消息: ${error.message}`);
        console.error(`代理URL: ${CONFIG.PROXY_URL}`);
        console.error(`代理类型: ${CONFIG.PROXY_TYPE}`);

        console.error('\n💡 代理配置建议:');
        console.error('- 确保代理服务器正在运行');
        console.error('- 检查代理地址格式是否正确');
        console.error('- 尝试不同的代理类型');
        console.error('- 确认代理支持HTTPS连接');

        return null;
    }
}

// 测试代理连接
async function testProxyConnection() {
    console.log('\n🧪 开始测试代理连接...');

    try {
        const proxyAgent = createProxyAgent();
        if (!proxyAgent) {
            console.log('❌ 代理Agent创建失败，跳过测试');
            return false;
        }
    } catch (error) {
        console.error('\n❌ 代理测试过程中发生未知错误:');
        console.error(`错误消息: ${error.message}`);
        return false;
    }
}

// 注意：已移除查询转账记录的功能，现在直接计算用户在池子中的实际持有量

// 主函数
async function main() {
    console.log('=== DOG代币池子持有量统计 ===');
    console.log('::group::配置信息');

    // 配置检查
    console.log('📋 配置信息:');
    console.log(`   池子地址: ${CONFIG.POOL_ADDRESS}`);
    console.log(`   使用代理: ${CONFIG.USE_PROXY ? '是' : '否'}`);
    if (CONFIG.USE_PROXY) {
        console.log(`   代理地址: ${CONFIG.PROXY_URL} (${CONFIG.PROXY_TYPE})`);
    }
    console.log(`   API Key: ${CONFIG.API_KEY ? '已配置' : '未配置'}`);
    console.log('::endgroup::');
    console.log('');

    // 验证配置
    if (!CONFIG.API_KEY || !CONFIG.SECRET_KEY || !CONFIG.PASSPHRASE) {
        console.error('❌ API配置不完整，请检查环境变量或配置文件');
        process.exit(1);
    }

    // 检查配置
    if (CONFIG.API_KEY === 'your_api_key_here') {
        console.log('请先配置API_KEY等参数！');
        console.log('2. 注册账户并生成API key');
        console.log('3. 设置SECRET_KEY和PASSPHRASE');
        console.log('4. 设置POOL_ADDRESS（池子地址）');
        console.log('5. 如需使用代理，请设置USE_PROXY=true并配置PROXY_URL');
        return;
    }

    // 显示代理配置状态并测试连接
    if (CONFIG.USE_PROXY) {
        console.log(`✓ 已启用代理: ${CONFIG.PROXY_URL} (类型: ${CONFIG.PROXY_TYPE})`);

        // 测试代理连接
        const proxyWorking = await testProxyConnection();
        if (!proxyWorking) {
            console.log('\n⚠️ 代理测试失败，但继续执行主流程...');
            console.log('你可以忽略此警告继续运行，或修复代理配置');
        }
    } else {
        console.log('ℹ 未启用代理，如遇网络问题请配置代理');
        console.log('  配置方法: 设置USE_PROXY=true并配置PROXY_URL');
    }

    // 第一步：获取池子当前的实际DOG代币余额
    console.log('::group::获取池子实际余额');
    const poolBalanceData = await calculateUserPoolDOGHoldings(
        CONFIG.POOL_ADDRESS, // 查询池子本身的余额
        CONFIG.POOL_ADDRESS,
        CONFIG.POOL_ADDRESS,
        DOG_CONTRACT
    ).then(result => ({
        balance: result.poolDOGReserve || 0,
        symbol: 'DOG'
    })).catch(() => ({
        balance: 0,
        symbol: 'DOG'
    }));
    console.log(`池子DOG储备量: ${poolBalanceData.balance.toLocaleString()} DOG`);
    console.log('::endgroup::');

    // 第二步：计算每个用户在池子中的实际DOG持有量
    console.log('::group::计算用户实际池子持有量');
    const userStatsArray = [];

    for (const user of usersData) {
        console.log(`正在计算用户 ${user.nickname} 的池子持有量...`);

        let totalDOGHoldings = 0;
        let totalLPBalance = 0;
        const addressHoldings = [];

        // 计算每个地址的持有量
        for (const address of user.addresses) {
            console.log(`  计算地址 ${address.slice(0, 6)}...${address.slice(-4)}`);

            const holdings = await calculateUserPoolDOGHoldings(
                address,
                CONFIG.POOL_ADDRESS,
                CONFIG.POOL_ADDRESS, // 池子合约就是LP代币合约
                DOG_CONTRACT
            );

            if (holdings.dogHoldings > 0) {
                totalDOGHoldings += holdings.dogHoldings;
                totalLPBalance += holdings.lpBalance;
                addressHoldings.push({
                    address: address,
                    dogHoldings: holdings.dogHoldings,
                    lpBalance: holdings.lpBalance,
                    userShare: holdings.userShare || 0
                });
            }

            // 避免API限流
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        if (totalDOGHoldings > 0) {
            userStatsArray.push({
                nickname: user.nickname,
                totalDOGHoldings: totalDOGHoldings,
                totalLPBalance: totalLPBalance,
                addressHoldings: addressHoldings
            });

            console.log(`${user.nickname} 池子DOG持有量: ${totalDOGHoldings.toFixed(6)} DOG`);
        }
    }
    console.log('::endgroup::');

    // 按DOG持有量排序
    userStatsArray.sort((a, b) => b.totalDOGHoldings - a.totalDOGHoldings);

    // 计算总计
    const totalDOGHoldings = userStatsArray.reduce((sum, user) => sum + user.totalDOGHoldings, 0);

    // 输出统计结果
    console.log(`\n=== 实际池子持有量统计 ===`);
    console.log(`用户总DOG持有量: ${totalDOGHoldings.toFixed(6)} DOG`);
    console.log(`持有LP代币的用户数: ${userStatsArray.length} 个`);

    // 显示池子实际余额
    if (poolBalanceData) {
        console.log(`\n=== 池子储备量对比 ===`);
        console.log(`池子当前DOG储备量: ${poolBalanceData.balance.toLocaleString()} DOG`);
        console.log(`用户持有DOG总量: ${totalDOGHoldings.toFixed(6)} DOG`);

        const unallocatedDOG = poolBalanceData.balance - totalDOGHoldings;
        const unallocatedPercent = poolBalanceData.balance > 0 ? (unallocatedDOG / poolBalanceData.balance) * 100 : 0;

        console.log(`未分配DOG量: ${unallocatedDOG.toFixed(6)} DOG (${unallocatedPercent.toFixed(2)}%)`);

        if (Math.abs(unallocatedDOG) > 0.01) {
            console.log(`ℹ️  未分配DOG可能来自初始流动性或其他来源`);
        }
    } else {
        console.log(`\n⚠️  无法获取池子实际余额，请检查API配置`);
    }

    console.log('\n=== 用户池子持有量详情（按持有量排序） ===');
    userStatsArray.forEach((user, index) => {
        console.log(`${index + 1}. ${user.nickname}:`);
        console.log(`   池子DOG持有量: ${user.totalDOGHoldings.toFixed(6)} DOG`);

        if (user.totalLPBalance > 0) {
            console.log(`   LP代币持有量: ${user.totalLPBalance.toFixed(6)}`);
        }

        // 显示各地址详情
        if (user.addressHoldings && user.addressHoldings.length > 0) {
            user.addressHoldings.forEach(addr => {
                console.log(`   - ${addr.address.slice(0, 6)}...${addr.address.slice(-4)}: ${addr.dogHoldings.toFixed(6)} DOG`);
            });
        }

        console.log('');
    });

    // 保存详细结果到文件
    const result = {
        summary: {
            poolAddress: CONFIG.POOL_ADDRESS,
            poolActualBalance: poolBalanceData ? poolBalanceData.balance : null,
            totalDOGHoldings: totalDOGHoldings,
            usersWithHoldings: userStatsArray.length
        },
        userDetails: userStatsArray,
        poolBalanceData: poolBalanceData,
        queryTime: new Date().toISOString()
    };

    fs.writeFileSync('pool-holdings-stats.json', JSON.stringify(result, null, 2));
    console.log('\n详细结果已保存到 pool-holdings-stats.json');

    // 保存简化版本
    const simpleResult = {
        summary: result.summary,
        userDetails: userStatsArray.map(user => ({
            nickname: user.nickname,
            totalDOGHoldings: user.totalDOGHoldings,
            totalLPBalance: user.totalLPBalance
        })),
        poolBalanceData: poolBalanceData,
        queryTime: result.queryTime
    };

    fs.writeFileSync('pool-holdings-stats-simple.json', JSON.stringify(simpleResult, null, 2));
    console.log('简化结果已保存到 pool-holdings-stats-simple.json');
    console.log('::endgroup::');
}

main().catch(console.error);


