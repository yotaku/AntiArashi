const { Client, GatewayIntentBits, Partials } = require('discord.js');
const config = require('./config.json');
const http = require('http');
const fetch = require('node-fetch');

// HTTPサーバー（Render対策）
http.createServer((_, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
}).listen(process.env.PORT || 3000);

// Discordクライアント設定
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
});

// URLを展開（短縮リンク対応）
async function expandUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (AntiArashiBot)'
      }
    });

    const finalUrl = response.url || url;

    // metaリダイレクト対策
    const text = await response.text();
    const metaMatch = text.match(/http-equiv=["']refresh["'] content=["']\d+;\s*url=(.*?)["']/i);
    if (metaMatch) return metaMatch[1];

    return finalUrl;
  } catch {
    return url;
  }
}

// 不正URL検出＆Kick処理
async function checkAndKick(message) {
  if (!message || !message.content || message.author?.bot) return;

  const content = message.content.toLowerCase();
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex) || [];

  for (const url of urls) {
    const rawUrl = url.toLowerCase();

    // ✅ 強制キーワードに一致するか（展開せず）
    const forceMatched = config.forceKickKeywords?.some(keyword =>
      rawUrl.includes(keyword.toLowerCase())
    );

    // ✅ URLを展開して招待リンクなどと照合
    const expandedUrl = await expandUrl(url);
    const inviteMatched = config.bannedInvites?.some(invite =>
      expandedUrl.toLowerCase().includes(invite.toLowerCase())
    );

    if (forceMatched || inviteMatched) {
      try {
        await message.delete();
        console.log(`🗑️ Deleted message from ${message.author.tag}: ${url}`);

        // ✅ DM送信（共通）
        try {
          await message.author.send("あなたが送信したメッセージは荒らし対策により削除されました。");
        } catch (dmErr) {
          console.warn(`⚠️ DM送信失敗: ${message.author.tag}`);
        }

        if (inviteMatched) {
          // ✅ 招待リンクなどに一致 → キックする
          await message.guild.members.kick(message.author.id, `Posted banned invite URL`);
          console.log(`❌ Kicked ${message.author.tag} for posting: ${url}`);
        } else if (forceMatched) {
          // ✅ forceキーワードに一致 → キックしない
          console.log(`🚨 Force keyword matched for ${message.author.tag}, kick skipped.`);
        }

      } catch (err) {
        console.error(`⚠️ 処理失敗: ${message.author.tag}`, err);
      }

      return; // 1件検出で処理終了
    }
  }
}

client.on('messageCreate', checkAndKick);
client.on('messageUpdate', (_, newMsg) => checkAndKick(newMsg));

// ==========================
// 🔰 連続投稿スパム対策機能
// ==========================

// スパム対策設定（必要に応じてconfig.jsonに移せます）
const spamConfig = {
  maxMessages: 5,          // 許容される最大投稿数
  interval: 10 * 1000,     // 監視時間（ミリ秒）10秒
  kickOnSpam: true         // スパム検出でKickするか
};

// ユーザーの投稿履歴を記録
const messageLogs = new Map();

function cleanupOldLogs(userId) {
  const now = Date.now();
  const logs = messageLogs.get(userId) || [];
  const updatedLogs = logs.filter(ts => now - ts < spamConfig.interval);
  messageLogs.set(userId, updatedLogs);
  return updatedLogs;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;

  // ログ更新
  const logs = cleanupOldLogs(userId);
  logs.push(Date.now());
  messageLogs.set(userId, logs);

  if (logs.length >= spamConfig.maxMessages) {
    // スパムと判定
    try {
      await message.delete();
      await message.author.send('あなたの連続したメッセージはスパムと判断され、削除されました。');

      if (spamConfig.kickOnSpam) {
        await message.guild.members.kick(userId, 'Spamming messages');
        console.log(`❌ ${message.author.tag} をスパム投稿でKickしました。`);
      } else {
        console.log(`🚨 ${message.author.tag} がスパム投稿しましたがKickは無効。`);
      }
    } catch (err) {
      console.error(`⚠️ スパム対処エラー (${message.author.tag})`, err);
    }

    messageLogs.set(userId, []); // ログリセット
  }
});

client.login(process.env.BOT_TOKEN);
