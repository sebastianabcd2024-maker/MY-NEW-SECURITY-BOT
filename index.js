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

// --- STORAGE LOCAL ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 

// --- REGISTRO DE COMANDOS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v3.9 [CUSTOM-ANTISPAM] | Online`);
    
    const commands = [
        // ... (tus comandos anteriores se mantienen iguales)
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
        { 
            name: 'setup-antispam', 
            description: 'Configure Anti-Spam settings', 
            options: [
                { name: 'limit', type: 4, description: 'Message limit (e.g., 5)', required: true },
                { name: 'seconds', type: 4, description: 'Time window in seconds (e.g., 5)', required: true },
                { name: 'immune_role', type: 8, description: 'Role that bypasses anti-spam', required: false }
            ] 
        },
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
        { 
            name: 'create-role', 
            description: 'Creates a role with predefined permission levels', 
            options: [
                { name: 'name', type: 3, description: 'Role name', required: true },
                { name: 'color', type: 3, description: 'Hex color', required: false },
                { name: 'level', type: 3, description: 'Permission tier', choices: [
                    { name: 'Decoration', value: 'decoration' }, { name: 'Member', value: 'member' },
                    { name: 'Moderator', value: 'moderator' }, { name: 'Senior Moderator', value: 'senior_mod' },
                    { name: 'Administrator', value: 'administrator' }, { name: 'Developer', value: 'developer' }
                ]}
            ] 
        },
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
        { name: 'flip', description: 'Coin flip' },
        { 
            name: 'embed', 
            description: 'Generate a custom embed', 
            options: [
                { name: 'description', type: 3, description: 'Main content', required: true },
                { name: 'title', type: 3, description: 'Embed title' },
                { name: 'color', type: 3, description: 'Hex color' },
                { name: 'thumbnail', type: 3, description: 'Thumbnail URL' },
                { name: 'image', type: 3, description: 'Large image URL' }
            ] 
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- ANTI-SPAM DINÁMICO ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    
    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    const now = Date.now();
    const windowMs = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
        return;
    }

    const userData = spamMap.get(message.author.id);
    
    if (now - userData.lastMessage < windowMs) { 
        userData.count++; 
    } else { 
        userData.count = 1; 
    }
    userData.lastMessage = now;

    if (userData.count >= limit) {
        userData.count = 0;
        try {
            const msgs = await message.channel.messages.fetch({ limit: 15 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
            await message.member.timeout(600000, 'Anti-Spam Triggered');
            message.channel.send(`🛡️ **Warden Anti-Spam:** ${message.author} muted for exceeding limit (${limit} msgs / ${config.spam_seconds}s).`);
        } catch (err) { console.error('Anti-spam error ignored.'); }
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const quickEmbed = (title, desc, color = '#ffffff') => {
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] 
        }).catch(() => null);
    };

    const config = localConfig.get(guild.id);
    const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
    
    if (!['audit', 'flip', 'color', 'embed'].includes(commandName) && !hasAuth) {
        return quickEmbed('❌ Access Denied', 'Unauthorized. You lack permissions.', '#ff0000');
    }

    try {
        switch (commandName) {
            case 'setup-antispam':
                const limit = options.getInteger('limit');
                const seconds = options.getInteger('seconds');
                const immune = options.getRole('immune_role');

                localConfig.set(guild.id, { 
                    ...localConfig.get(guild.id), 
                    spam_limit: limit, 
                    spam_seconds: seconds,
                    immune_role_id: immune?.id || null 
                });

                return quickEmbed('🛡️ Anti-Spam Configured', 
                    `**Limit:** ${limit} messages\n**Window:** ${seconds} seconds\n**Immune Role:** ${immune || 'None'}`, 
                    '#2ecc71');

            case 'set-admin-role':
                const adminRole = options.getRole('role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: adminRole.id });
                return quickEmbed('✅ Security Updated', `Admin role set to: **${adminRole.name}**`, '#2ecc71');

            // ... (el resto de tus comandos como ban, kick, audit, etc. se mantienen igual)
            case 'audit':
                const aTarget = options.getMember('user');
                if (!aTarget) throw new Error('Target not found.');
                const accountAge = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const joinServer = Math.floor((Date.now() - aTarget.joinedTimestamp) / 86400000);
                const auditEmbed = new EmbedBuilder()
                    .setAuthor({ name: `Audit Report: ${aTarget.user.username}`, iconURL: aTarget.user.displayAvatarURL() })
                    .setColor(accountAge >= 30 ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: '🆔 User ID', value: `\`${aTarget.user.id}\``, inline: false },
                        { name: '📅 Joined Discord', value: `about ${accountAge} days ago`, inline: true },
                        { name: '📥 Joined Server', value: `about ${joinServer} days ago`, inline: true }
                    );
                return interaction.editReply({ embeds: [auditEmbed] });

            case 'ban':
                const bUser = options.getUser('user');
                const bReason = options.getString('reason') || 'No reason';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed('🔨 Ban Applied', `**Target:** ${bUser.tag}`, '#ff0000');

            // NOTA: Para no hacer el mensaje infinito, asumo que mantienes el switch 
            // con el resto de casos que ya tenías (purge, lock, role-give, etc.)
        }
    } catch (err) {
        console.error(err);
        return quickEmbed('❌ Error', `Action failed: \`${err.message}\``, '#ff0000');
    }
});

client.login(TOKEN);
