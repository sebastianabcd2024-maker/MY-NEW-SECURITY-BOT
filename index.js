const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, PermissionFlagsBits, REST, Routes 
} = require('discord.js');
const fs = require('fs');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 

const getDB = () => {
    if (!fs.existsSync('./security_db.json')) fs.writeFileSync('./security_db.json', JSON.stringify({}));
    return JSON.parse(fs.readFileSync('./security_db.json', 'utf8'));
};
const saveDB = (data) => fs.writeFileSync('./security_db.json', JSON.stringify(data, null, 2));

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Security Manager v1.6 | Global Edition Online`);
    
    const commands = [
        {
            name: 'embed',
            description: 'Create a professional embed message',
            default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
            options: [
                { name: 'description', type: 3, description: 'Main message content', required: true },
                { name: 'title', type: 3, description: 'Embed title', required: false },
                { name: 'color', type: 3, description: 'Hex Color (#ffffff)', required: false },
                { name: 'footer', type: 3, description: 'Footer text', required: false }
            ]
        },
        { name: 'ban', description: 'Ban a user from the server', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason for the ban' }] },
        { name: 'kick', description: 'Kick a user from the server', default_member_permissions: PermissionFlagsBits.KickMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason for the kick' }] },
        { name: 'timeout', description: 'Mute a user temporarily', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'minutes', type: 4, description: 'Duration in minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'purge', description: 'Delete a bulk of messages', default_member_permissions: PermissionFlagsBits.ManageMessages.toString(), options: [{ name: 'amount', type: 4, description: 'Amount (1-100)', required: true }] },
        { name: 'lock', description: 'Lock the current channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'unlock', description: 'Unlock the current channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'warn', description: 'Issue a warning to a user', options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View user infraction history', options: [{ name: 'user', type: 6, description: 'Target user', required: true }] },
        { name: 'echo', description: 'Make the bot repeat a message', options: [{ name: 'text', type: 3, description: 'Message text', required: true }] },
        { name: 'slowmode', description: 'Set channel slowmode', options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const db = getDB();
    const config = db[interaction.guildId] || { warns: {} };
    const { commandName, options, channel } = interaction;

    // --- MODERATION WITH PUBLIC EMBEDS ---
    if (['kick', 'ban', 'timeout'].includes(commandName)) {
        await interaction.deferReply();
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';

        if (!target || !target.manageable) return interaction.editReply("❌ I cannot moderate this user. Check role hierarchy.");

        const actionEmbed = new EmbedBuilder()
            .setTitle(`🛑 Security Action: ${commandName.toUpperCase()}`)
            .setColor(commandName === 'ban' ? '#ff0000' : '#ffaa00')
            .addFields(
                { name: 'User', value: `${target.user.tag}`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();

        try {
            if (commandName === 'ban') await target.ban({ reason });
            else if (commandName === 'kick') await target.kick(reason);
            else await target.timeout(options.getInteger('minutes') * 60000, reason);
            
            return interaction.editReply({ embeds: [actionEmbed] });
        } catch (e) {
            return interaction.editReply("❌ Execution failed. Check my permissions.");
        }
    }

    // --- PURGE ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: 'Please choose a number between 1 and 100.', ephemeral: true });
        await channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
    }

    // --- LOCK / UNLOCK ---
    if (commandName === 'lock' || commandName === 'unlock') {
        const isLock = commandName === 'lock';
        await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: !isLock });
        return interaction.reply(`🔒 Channel has been **${isLock ? 'LOCKED' : 'UNLOCKED'}**.`);
    }

    // --- CUSTOM EMBED ---
    if (commandName === 'embed') {
        const embed = new EmbedBuilder()
            .setDescription(options.getString('description'))
            .setColor(options.getString('color') || '#ffffff');
        if (options.getString('title')) embed.setTitle(options.getString('title'));
        if (options.getString('footer')) embed.setFooter({ text: options.getString('footer') });
        return interaction.reply({ embeds: [embed] });
    }

    // --- WARNS & HISTORY ---
    if (commandName === 'warn') {
        const target = options.getUser('user');
        if (!config.warns) config.warns = {};
        if (!config.warns[target.id]) config.warns[target.id] = [];
        config.warns[target.id].push({ reason: options.getString('reason'), date: new Date().toLocaleString('es-CO') });
        db[interaction.guildId] = config; saveDB(db);
        return interaction.reply(`⚠️ **Warning issued to ${target.tag}**.`);
    }

    if (commandName === 'infractions') {
        const target = options.getUser('user');
        const list = config.warns?.[target.id] || [];
        const embed = new EmbedBuilder().setTitle(`Infraction History: ${target.tag}`).setColor('#ffffff')
            .setDescription(list.length ? list.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') : '✅ Record is clean.');
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.reply({ content: 'Message sent.', ephemeral: true });
    }

    if (commandName === 'slowmode') {
        await channel.setRateLimitPerUser(options.getInteger('seconds'));
        return interaction.reply(`⏳ Slowmode set to **${options.getInteger('seconds')}s**.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
