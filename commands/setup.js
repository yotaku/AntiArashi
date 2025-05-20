const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.json');

module.exports = {
  name: 'setup',
  description: 'ログを送信するチャンネルを設定します。',
  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ このコマンドは管理者のみ使用できます。', ephemeral: true });
    }

    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    let db = {};
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {}

    db[guildId] = channelId;

    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    await interaction.reply(`✅ このチャンネルをログ送信先に設定しました。`);
  }
};
