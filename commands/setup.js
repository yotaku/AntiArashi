const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('ログを送信するチャンネルを設定します。')
    .addChannelOption(option =>
      option.setName('channel').setDescription('ログを送信するチャンネル').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const channel = interaction.options.getChannel('channel');

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ このコマンドは管理者のみ使用できます。', ephemeral: true });
    }

    let db = {};
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch {}

    db[guildId] = channel.id;
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

    await interaction.reply(`✅ ログ送信先を <#${channel.id}> に設定しました。`);
  }
};
