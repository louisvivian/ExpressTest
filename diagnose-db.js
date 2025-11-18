require('dotenv').config();
const https = require('https');
const dns = require('dns').promises;

console.log('=== 数据库连接诊断工具 ===\n');

// 1. 检查环境变量
console.log('1. 检查环境变量配置...');
if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL 未设置！');
    console.log('请创建 .env 文件并添加 DATABASE_URL');
    process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
console.log('✓ DATABASE_URL 已设置:', maskedUrl);

// 解析数据库 URL
let hostname, port;
try {
    const url = new URL(dbUrl.replace('postgresql://', 'http://'));
    hostname = url.hostname;
    port = url.port || 5432;
    console.log('✓ 解析数据库地址:', `${hostname}:${port}`);
} catch (error) {
    console.error('❌ DATABASE_URL 格式错误:', error.message);
    process.exit(1);
}

// 2. DNS 解析测试
console.log('\n2. DNS 解析测试...');
Promise.all([
    dns.resolve4(hostname).catch(() => null),
    dns.resolve6(hostname).catch(() => null)
])
    .then(([ipv4, ipv6]) => {
        if (ipv4) {
            console.log('✓ IPv4 解析成功:', ipv4.join(', '));
            return testConnection(hostname, port);
        } else if (ipv6) {
            console.log('✓ IPv6 解析成功:', ipv6.join(', '));
            return testConnection(hostname, port);
        } else {
            console.error('❌ DNS 解析失败：无法解析 IPv4 和 IPv6');
            console.log('\n⚠️  重要提示：');
            console.log('DNS 解析失败通常意味着：');
            console.log('1. Supabase 项目已被删除或暂停');
            console.log('2. 项目引用（ref）不正确');
            console.log('3. 网络连接问题');
            console.log('\n建议操作：');
            console.log('1. 登录 Supabase 控制台检查项目状态');
            console.log('2. 在 Supabase 项目设置中获取最新的连接字符串');
            console.log('3. 确认项目是否正常运行');
            console.log('4. 如果是免费项目，检查是否因不活跃而被暂停');
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error('❌ 测试过程出错:', error.message);
        process.exit(1);
    });

// 3. 端口连接测试
function testConnection(host, port) {
    return new Promise((resolve, reject) => {
        console.log(`\n3. 测试端口连接 ${host}:${port}...`);
        
        const net = require('net');
        const socket = new net.Socket();
        const timeout = 5000;
        
        socket.setTimeout(timeout);
        
        socket.on('connect', () => {
            console.log('✓ 端口连接成功！');
            socket.destroy();
            resolve();
        });
        
        socket.on('timeout', () => {
            console.error('❌ 连接超时');
            socket.destroy();
            reject(new Error('连接超时'));
        });
        
        socket.on('error', (error) => {
            if (error.code === 'ETIMEDOUT' || error.message.includes('超时')) {
                console.error('❌ 连接超时（5秒）');
            } else {
                console.error('❌ 连接失败:', error.message);
            }
            console.log('\n可能的原因：');
            console.log('1. Supabase 项目已暂停（免费项目可能因不活跃而暂停）');
            console.log('2. 防火墙或网络代理阻止了连接');
            console.log('3. Supabase 数据库服务器暂时不可用');
            console.log('4. IP 地址被限制（检查 Supabase 项目设置）');
            console.log('\n建议操作：');
            console.log('1. 登录 Supabase 控制台：https://app.supabase.com');
            console.log('2. 检查项目状态和数据库连接设置');
            console.log('3. 如果是暂停的项目，需要恢复项目');
            console.log('4. 检查是否有 IP 白名单限制');
            reject(error);
        });
        
        socket.connect(port, host);
    });
}

