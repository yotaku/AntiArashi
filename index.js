const { PermissionFlagsBits } = require('discord.js');

// 変更されたスパム対策設定
const spamConfig = {
  maxMessages: 5,
  interval: 10 * 1000,      // 10秒間
  timeoutDuration: 30 * 1000 // 30秒タイムアウト
};

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
  const guild = message.guild;

  // ログ更新
  const logs = cleanupOldLogs(userId);
  logs.push(Date.now());
  messageLogs.set(userId, logs);

  if (logs.length >= spamConfig.maxMessages) {
    try {
      // 直近の全メッセージを削除
      const fetched = await message.channel.messages.fetch({ limit: 100 });
      const userMessages = fetched.filter(
        m => m.author.id === userId && Date.now() - m.createdTimestamp < spamConfig.interval
      );
      for (const msg of userMessages.values()) {
        await msg.delete().catch(() => {});
      }

      // DM送信
      try {
        await message.author.send('あなたの連続したメッセージはスパムと判断され、削除されました。30秒間メッセージを送信できなくなります。');
      } catch {
        console.warn(`⚠️ DM送信失敗: ${message.author.tag}`);
      }

      // タイムアウト
      const member = await guild.members.fetch(userId);
      if (member?.moderatable && member?.timeout) {
        await member.timeout(spamConfig.timeoutDuration, 'スパム対策によるタイムアウト');
      }

      // ログ送信（config.logChannelId）
      const logChannel = guild.channels.cache.get(config.logChannelId);
      if (logChannel && logChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
        await logChannel.send(`🛑 ${message.author.tag} がスパム投稿により削除・30秒タイムアウトされました。`);
      }

    } catch (err) {
      console.error(`⚠️ スパム対処エラー (${message.author.tag})`, err);
    }

    messageLogs.set(userId, []); // ログリセット
  }
});
