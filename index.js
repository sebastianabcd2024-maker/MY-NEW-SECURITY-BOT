const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType 
} = require('discord.js');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 
const TOKEN = process.env.DISCORD_TOKEN;

// --- 1. LOCAL STORAGE (Sustituye a la nube temporalmente) ---
const localConfig = new Map(); // Guarda: guild_id -> { admin_role_id, logs_channel_id }
const localWarns = new Map();  // Guarda: user_id -> [warnings]

// --- 2. REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v3.3 [LOCAL MODE] | Ready to protect.`);
    
    const commands = [
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
        { name: 'audit', description: 'User security analysis', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'ban', description: 'Ban user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }] },
        { name: 'kick', description: 'Kick user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'role-give', description: 'Add role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'create-channel', description: 'Create a channel', options: [
            { name: 'name', type: 3, description: 'Channel name', required: true },
            { name: 'type', type: 3, description: 'Text or Voice', required: true, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] }
        ]},
        { name: 'purge', description: 'Clear messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'lock', description: 'Lock channel' },
        { name: 'unlock', description: 'Unlock channel' },
        { name: 'investigate', description: 'Private isolation', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'release', description: 'End investigation' },
        { name: 'color', description: 'Color info', options: [{ name: 'input', type: 3, description: 'Hex or Name', required: true }] },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Text', required: true }] },
        { name: 'flip', description: 'Coin flip' }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- 3. LOGIC HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const isPublic = ['audit', 'flip', 'color'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    // Helper para enviar logs automáticamente
    const sendLog = async (title, desc, color = '#3498db') => {
        const config = localConfig.get(guild.id);
        if (!config || !config.logs_channel_id) return;
        const logChan = guild.channels.cache.get(config.logs_channel_id);
        if (logChan) {
            const logEmbed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
            logChan.send({ embeds: [logEmbed] });
        }
    };

    const quickEmbed = (title, description, color = '#ffffff') => {
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    };

    // SECURITY CHECK (LOCAL)
    if (!['audit', 'flip', 'color', 'set-admin-role', 'set-logs'].includes(commandName)) {
        const config = localConfig.get(guild.id);
        const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'Unauthorized. Contact an Admin.', '#ff0000');
    }

    // --- CONFIG COMMANDS ---
    if (commandName === 'set-admin-role') {
        const role = options.getRole('role');
        const current = localConfig.get(guild.id) || {};
        localConfig.set(guild.id, { ...current, admin_role_id: role.id });
        return quickEmbed('✅ Security Updated', `Admin role set to: **${role.name}**`, '#2ecc71');
    }

    if (commandName === 'set-logs') {
        const logChan = options.getChannel('channel');
        const current = localConfig.get(guild.id) || {};
        localConfig.set(guild.id, { ...current, logs_channel_id: logChan.id });
        return quickEmbed('✅ Logs Configured', `Warden will now report to ${logChan}`, '#2ecc71');
    }

    // --- MODERATION ---
    if (['ban', 'kick', 'timeout', 'warn'].includes(commandName)) {
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';
        if (!target.manageable) return quickEmbed('❌ Error', 'Hierarchy restriction.', '#ff0000');

        if (commandName === 'ban') await target.ban({ reason });
        if (commandName === 'kick') await target.kick(reason);
        if (commandName === 'timeout') await target.timeout(options.getInteger('minutes') * 60000, reason);
        if (commandName === 'warn') {
            const warns = localWarns.get(target.id) || [];
            warns.push(reason);
            localWarns.set(target.id, warns);
        }

        await sendLog(`🛑 Action: ${commandName.toUpperCase()}`, `**User:** ${target.user.tag}\n**Mod:** ${member.user.tag}\n**Reason:** ${reason}`, '#ff0000');
        return quickEmbed(`🛑 ${commandName.toUpperCase()}`, `Action applied to **${target.user.tag}**.`, '#ff0000');
    }

    if (commandName === 'infractions') {
        const target = options.getUser('user');
        const history = localWarns.get(target.id) || [];
        const list = history.map((w, i) => `**${i+1}.** ${w}`).join('\n') || 'Clean record.';
        return quickEmbed(`📄 History: ${target.tag}`, list, '#3498db');
    }

    // --- CHANNELS & ROLES ---
    if (commandName === 'create-channel') {
        const name = options.getString('name');
        const type = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
        const newChan = await guild.channels.create({ name, type });
        await sendLog('📂 Channel Created', `New channel: ${newChan} by ${member.user.tag}`);
        return quickEmbed('✅ Created', `Channel ${newChan} is ready.`, '#2ecc71');
    }

    if (commandName === 'audit') {
        const target = options.getMember('user');
        const age = Math.floor((Date.now() - target.user.createdTimestamp) / (1000 * 60 * 60 * 24));
        const auditEmbed = new EmbedBuilder()
            .setAuthor({ name: `Audit: ${target.user.tag}`, iconURL: target.user.displayAvatarURL() })
            .setColor(age >= 30 ? '#2ecc71' : '#ff0000')
            .addFields(
                { name: '🆔 ID', value: `\`${target.user.id}\``, inline: true },
                { name: '📅 Joined', value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: '⚖️ Status', value: age >= 30 ? '✅ SAFE' : '⚠️ WARNING' }
            );
        return interaction.editReply({ embeds: [auditEmbed] });
    }

    // INVESTIGATE / RELEASE
    if (commandName === 'investigate') {
        const target = options.getMember('user');
        const invChan = await guild.channels.create({
            name: `investigation-${target.user.username}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                { id: target.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
            ]
        });
        await sendLog('⚖️ Investigation', `User ${target.user.tag} isolated by ${member.user.tag}`, '#e67e22');
        return quickEmbed('⚖️ Isolated', `Channel: ${invChan}`, '#e67e22');
    }

    if (commandName === 'release') {
        if (!channel.name.startsWith('investigation-')) return quickEmbed('❌ Error', 'Not an investigation channel.', '#ff0000');
        await quickEmbed('✅ Concluded', 'Closing channel in 5s...', '#2ecc71');
        setTimeout(() => channel.delete(), 5000);
        return;
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.editReply({ content: 'Sent.' });
    }
});

client.login(TOKEN);
