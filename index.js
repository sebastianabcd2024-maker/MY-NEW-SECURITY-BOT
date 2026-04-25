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
    console.log(`🛡️ Warden Systems v3.4 [ANTI-SPAM MODE] | Online`);
    
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

// --- 3. LÓGICA ANTI-SPAM (EVENTO DE MENSAJE) ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    const now = Date.now();
    const config = localConfig.get(message.guild.id);
    
    // Inmunidad para Admins
    if (message.member.permissions.has(PermissionFlagsBits.Administrator) || 
       (config && message.member.roles.cache.has(config.admin_role_id))) return;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
        return;
    }

    const userData = spamMap.get(message.author.id);
    if (now - userData.lastMessage < 5000) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;

    if (userData.count >= 5) {
        userData.count = 0;
        try {
            const msgs = await message.channel.messages.fetch({ limit: 10 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);

            try {
                await message.member.timeout(600000, 'Anti-Spam Triggered');
                message.channel.send(`🛡️ **Warden:** ${message.author} muted for spam.`);
            } catch (err) {
                message.channel.send(`⚠️ **Warden:** Spam detected from ${message.author}. Messages cleared, but **could not apply timeout** (Hierarchy).`);
            }
        } catch (e) { console.error(e); }
    }
});

// --- 4. MANEJADOR DE INTERACCIONES (RESPUESTAS FIJAS) ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const isPublic = ['audit', 'flip', 'color'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const quickEmbed = (title, desc, color = '#ffffff') => {
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp()] });
    };

    // SEGURIDAD
    if (!['audit', 'flip', 'color', 'set-admin-role', 'set-logs'].includes(commandName)) {
        const config = localConfig.get(guild.id);
        const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'Unauthorized.', '#ff0000');
    }

    // LÓGICA DE COMANDOS
    try {
        if (commandName === 'set-admin-role') {
            const role = options.getRole('role');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: role.id });
            return quickEmbed('✅ Security Updated', `Admin role: **${role.name}**`, '#2ecc71');
        }

        if (commandName === 'lock' || commandName === 'unlock') {
            const isLock = commandName === 'lock';
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: !isLock });
            return quickEmbed(isLock ? '🔒 Locked' : '🔓 Unlocked', `Channel ${channel} updated.`, isLock ? '#e67e22' : '#2ecc71');
        }

        if (commandName === 'timeout') {
            const target = options.getMember('user');
            const min = options.getInteger('minutes');
            if (!target.manageable) return quickEmbed('❌ Error', 'Hierarchy restriction.', '#ff0000');
            await target.timeout(min * 60000);
            return quickEmbed('⏳ Timeout', `${target.user.tag} muted for ${min}m.`, '#e67e22');
        }

        if (commandName === 'purge') {
            const amount = options.getInteger('amount');
            await channel.bulkDelete(amount, true);
            return quickEmbed('🧹 Purge', `Deleted ${amount} messages.`, '#95a5a6');
        }

        if (commandName === 'role-give' || commandName === 'role-take') {
            const target = options.getMember('user');
            const role = options.getRole('role');
            commandName === 'role-give' ? await target.roles.add(role) : await target.roles.remove(role);
            return quickEmbed('🎭 Role', `Updated **${role.name}** for **${target.user.tag}**`, '#3498db');
        }

        if (commandName === 'audit') {
            const target = options.getMember('user');
            const age = Math.floor((Date.now() - target.user.createdTimestamp) / 86400000);
            return quickEmbed(`Audit: ${target.user.tag}`, `ID: \`${target.user.id}\`\nStatus: ${age >= 30 ? '✅ SAFE' : '⚠️ WARNING'}`, age >= 30 ? '#2ecc71' : '#ff0000');
        }

        // ... Otros comandos siguen la misma estructura de return quickEmbed ...
        if (commandName === 'flip') return quickEmbed('🪙 Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`);
        if (commandName === 'echo') { await channel.send(options.getString('text')); return interaction.editReply({ content: 'Sent.' }); }

    } catch (err) {
        return quickEmbed('❌ Critical Error', `Action failed: ${err.message}`, '#ff0000');
    }
});

client.login(TOKEN);
