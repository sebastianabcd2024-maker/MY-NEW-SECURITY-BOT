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
    console.log(`🛡️ Security Manager v1.7 | Role Management Online`);
    
    const commands = [
        // Role Management
        {
            name: 'role-give',
            description: 'Assign a role to a user',
            default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
            options: [
                { name: 'user', type: 6, description: 'Target user', required: true },
                { name: 'role', type: 8, description: 'Role to give', required: true }
            ]
        },
        {
            name: 'role-take',
            description: 'Remove a role from a user',
            default_member_permissions: PermissionFlagsBits.ManageRoles.toString(),
            options: [
                { name: 'user', type: 6, description: 'Target user', required: true },
                { name: 'role', type: 8, description: 'Role to take', required: true }
            ]
        },
        // Moderation
        { name: 'ban', description: 'Ban a user', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'kick', description: 'Kick a user', default_member_permissions: PermissionFlagsBits.KickMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute a user', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Duration', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'purge', description: 'Delete messages', default_member_permissions: PermissionFlagsBits.ManageMessages.toString(), options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'lock', description: 'Lock channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'unlock', description: 'Unlock channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'embed', description: 'Create professional embed', options: [{ name: 'description', type: 3, description: 'Content', required: true }, { name: 'title', type: 3, description: 'Title' }, { name: 'color', type: 3, description: 'Hex' }] },
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

    // --- ROLE MANAGEMENT ---
    if (commandName === 'role-give' || commandName === 'role-take') {
        await interaction.deferReply();
        const target = options.getMember('user');
        const role = options.getRole('role');

        if (!target || !role) return interaction.editReply("❌ User or Role not found.");
        
        // Check if the bot can manage this role
        if (role.position >= guild.members.me.roles.highest.position) {
            return interaction.editReply("❌ I cannot manage this role. It is higher than my own role.");
        }

        try {
            const isGiving = commandName === 'role-give';
            if (isGiving) await target.roles.add(role);
            else await target.roles.remove(role);

            const roleEmbed = new EmbedBuilder()
                .setTitle(`🎭 Role Update`)
                .setColor(isGiving ? '#00ff7f' : '#ff4500')
                .setDescription(`The role **${role.name}** has been ${isGiving ? 'assigned to' : 'removed from'} **${target.user.tag}**.`)
                .setTimestamp();

            return interaction.editReply({ embeds: [roleEmbed] });
        } catch (e) {
            return interaction.editReply("❌ Failed to update roles. Check my permissions.");
        }
    }

    // --- MODERATION ---
    if (['kick', 'ban', 'timeout'].includes(commandName)) {
        await interaction.deferReply();
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';

        if (!target || !target.manageable) return interaction.editReply("❌ I cannot moderate this user.");

        const actionEmbed = new EmbedBuilder()
            .setTitle(`🛑 Security Action: ${commandName.toUpperCase()}`)
            .setColor(commandName === 'ban' ? '#ff0000' : '#ffaa00')
            .addFields(
                { name: 'User', value: `${target.user.tag}`, inline: true },
                { name: 'Moderator', value: `${interaction.user.tag}`, inline: true },
                { name: 'Reason', value: reason }
            )
            .setTimestamp();

        if (commandName === 'ban') await target.ban({ reason });
        else if (commandName === 'kick') await target.kick(reason);
        else await target.timeout(options.getInteger('minutes') * 60000, reason);
        
        return interaction.editReply({ embeds: [actionEmbed] });
    }

    // --- UTILS ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        if (amount < 1 || amount > 100) return interaction.reply({ content: 'Choose 1-100.', ephemeral: true });
        await channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
    }

    if (commandName === 'lock' || commandName === 'unlock') {
        const isLock = commandName === 'lock';
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLock });
        return interaction.reply(`🔒 Channel **${isLock ? 'LOCKED' : 'UNLOCKED'}**.`);
    }

    if (commandName === 'embed') {
        const embed = new EmbedBuilder()
            .setDescription(options.getString('description'))
            .setColor(options.getString('color') || '#ffffff');
        if (options.getString('title')) embed.setTitle(options.getString('title'));
        return interaction.reply({ embeds: [embed] });
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
        const embed = new EmbedBuilder().setTitle(`History: ${target.tag}`).setColor('#ffffff')
            .setDescription(list.length ? list.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') : '✅ Clean.');
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
