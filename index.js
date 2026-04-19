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
    console.log(`🛡️ Security Manager v1.9 | Complete Moderation Suite Online`);
    
    const commands = [
        // Moderation
        { name: 'ban', description: 'Ban a user', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban a user by ID', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user_id', type: 3, description: 'User ID to unban', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'kick', description: 'Kick a user', default_member_permissions: PermissionFlagsBits.KickMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute a user', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Duration', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'purge', description: 'Delete messages', default_member_permissions: PermissionFlagsBits.ManageMessages.toString(), options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        // Roles
        { name: 'role-give', description: 'Assign a role', default_member_permissions: PermissionFlagsBits.ManageRoles.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove a role', default_member_permissions: PermissionFlagsBits.ManageRoles.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        // Management
        { name: 'lock', description: 'Lock channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'unlock', description: 'Unlock channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'embed', description: 'Create embed', options: [{ name: 'description', type: 3, description: 'Content', required: true }, { name: 'title', type: 3, description: 'Title' }, { name: 'color', type: 3, description: 'Hex' }] },
        { name: 'echo', description: 'Repeat message', options: [{ name: 'text', type: 3, description: 'Text', required: true }] },
        { name: 'slowmode', description: 'Set slowmode', options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const db = getDB();
    const config = db[interaction.guildId] || { warns: {} };
    const { commandName, options, guild, channel } = interaction;

    // --- BAN & UNBAN ---
    if (commandName === 'ban' || commandName === 'unban') {
        await interaction.deferReply();
        const reason = options.getString('reason') || 'No reason provided.';
        
        try {
            if (commandName === 'ban') {
                const target = options.getMember('user');
                if (!target || !target.manageable) return interaction.editReply("❌ Cannot moderate this user.");
                await target.ban({ reason });
                const embed = new EmbedBuilder().setTitle('🛑 Security Action: BAN').setColor('#ff0000').addFields({ name: 'User', value: `${target.user.tag}` }, { name: 'Reason', value: reason }).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            } else {
                const userId = options.getString('user_id');
                await guild.members.unban(userId, reason);
                const embed = new EmbedBuilder().setTitle('✅ Security Action: UNBAN').setColor('#00ff7f').setDescription(`User with ID **${userId}** has been unbanned.`).addFields({ name: 'Reason', value: reason }).setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            }
        } catch (e) { return interaction.editReply("❌ Operation failed. Verify the ID or my permissions."); }
    }

    // --- TIMEOUT & UNMUTE ---
    if (commandName === 'timeout' || commandName === 'unmute') {
        await interaction.deferReply();
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';
        if (!target || !target.manageable) return interaction.editReply("❌ Cannot moderate this user.");
        try {
            await target.timeout(commandName === 'timeout' ? options.getInteger('minutes') * 60000 : null, reason);
            const embed = new EmbedBuilder().setTitle(`🛑 Security Action: ${commandName.toUpperCase()}`).setColor(commandName === 'timeout' ? '#ffaa00' : '#00ff7f').addFields({ name: 'User', value: `${target.user.tag}` }, { name: 'Reason', value: reason }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (e) { return interaction.editReply("❌ Operation failed."); }
    }

    // --- OTRAS FUNCIONES ---
    if (commandName === 'kick') {
        await interaction.deferReply();
        const target = options.getMember('user');
        if (!target || !target.manageable) return interaction.editReply("❌ Cannot kick this user.");
        await target.kick(options.getString('reason') || 'No reason');
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🛑 Security Action: KICK').setColor('#ff4500').setDescription(`**${target.user.tag}** has been kicked.`)] });
    }

    if (commandName === 'role-give' || commandName === 'role-take') {
        await interaction.deferReply();
        const target = options.getMember('user');
        const role = options.getRole('role');
        if (role.position >= guild.members.me.roles.highest.position) return interaction.editReply("❌ Role is too high.");
        if (commandName === 'role-give') await target.roles.add(role); else await target.roles.remove(role);
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🎭 Role Update').setColor('#00ffff').setDescription(`Role **${role.name}** updated for **${target.user.tag}**.`)] });
    }

    if (commandName === 'purge') {
        await channel.bulkDelete(options.getInteger('amount'), true);
        return interaction.reply({ content: '🧹 Purge complete.', ephemeral: true });
    }

    if (commandName === 'lock' || commandName === 'unlock') {
        const isLock = commandName === 'lock';
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLock });
        return interaction.reply(`🔒 Channel **${isLock ? 'LOCKED' : 'UNLOCKED'}**.`);
    }

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
        const embed = new EmbedBuilder().setTitle(`History: ${target.tag}`).setColor('#ffffff').setDescription(list.length ? list.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') : '✅ Clean.');
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'embed') {
        const embed = new EmbedBuilder().setDescription(options.getString('description')).setColor(options.getString('color') || '#ffffff');
        if (options.getString('title')) embed.setTitle(options.getString('title'));
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.reply({ content: 'Sent.', ephemeral: true });
    }

    if (commandName === 'slowmode') {
        await channel.setRateLimitPerUser(options.getInteger('seconds'));
        return interaction.reply(`⏳ Slowmode: **${options.getInteger('seconds')}s**.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
