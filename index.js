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
const OWNER_ID = "1238184110975877130";
const TOKEN = process.env.DISCORD_TOKEN; 

const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const floodMap = new Map();
const blacklistedUsers = new Set();
const forbiddenWords = new Map();
const linkWhitelist = new Map();

// ========== NUEVO: SISTEMA DE CASTIGOS PROGRESIVOS ==========
const userStrikes = new Map(); // key: `${guildId}-${userId}`, value: array of timestamps (ms)
const STRIKE_DECAY_MS = 24 * 60 * 60 * 1000; // 24 horas

// Función para obtener el número de strikes válidos (últimas 24h) y limpiar los antiguos
function getValidStrikes(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const strikes = userStrikes.get(key) || [];
    const now = Date.now();
    const validStrikes = strikes.filter(ts => now - ts < STRIKE_DECAY_MS);
    if (validStrikes.length !== strikes.length) {
        userStrikes.set(key, validStrikes);
    }
    return validStrikes;
}

function addStrike(guildId, userId) {
    const key = `${guildId}-${userId}`;
    const strikes = userStrikes.get(key) || [];
    strikes.push(Date.now());
    userStrikes.set(key, strikes);
    return strikes.length;
}

async function applyProgressivePunishment(guild, user, moduleName, message = null, content = "N/A") {
    const config = localConfig.get(guild.id) || {};
    if (!config.progressive_enabled) return false;

    // Añadir strike y contar los activos
    addStrike(guild.id, user.id);
    const validStrikes = getValidStrikes(guild.id, user.id);
    const strikeCount = validStrikes.length;

    let action = null;
    let duration = null;
    let warnReason = null;

    // Determinar acción según el número de strikes
    if (strikeCount === 1) {
        action = "delete";
    } else if (strikeCount === 2) {
        action = "warn";
        warnReason = `AutoMod - ${moduleName} (2nd strike)`;
    } else if (strikeCount === 3) {
        action = "timeout";
        duration = 5 * 60 * 1000; // 5 minutos
        warnReason = `AutoMod - ${moduleName} (3rd strike, 5min timeout)`;
    } else {
        action = "timeout";
        // Aumentar progresivamente: 10, 20, 40 minutos... (máximo 1 hora)
        let multiplier = Math.pow(2, strikeCount - 3);
        duration = Math.min(5 * 60 * 1000 * multiplier, 60 * 60 * 1000);
        warnReason = `AutoMod - ${moduleName} (${strikeCount}th strike, ${duration/60000}min timeout)`;
    }

    // Ejecutar la acción
    let executed = false;
    let reasonText = "";

    try {
        if (action === "delete" && message) {
            await message.delete().catch(() => null);
            reasonText = `Message deleted (1st strike)`;
            executed = true;
        } 
        else if (action === "warn") {
            // Añadir warn al sistema localWarns
            const warns = localWarns.get(user.id) || [];
            warns.push({ date: new Date().toLocaleDateString(), reason: warnReason });
            localWarns.set(user.id, warns);
            reasonText = `Warning issued: ${warnReason}`;
            executed = true;
            if (message) await message.delete().catch(() => null);
        }
        else if (action === "timeout") {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member && member.manageable) {
                await member.timeout(duration, warnReason);
                reasonText = `Timed out for ${duration/60000} minutes: ${warnReason}`;
                executed = true;
                if (message) await message.delete().catch(() => null);
            } else {
                reasonText = `Failed to timeout user (missing permissions or not found)`;
            }
        }
    } catch (err) {
        reasonText = `Error applying punishment: ${err.message}`;
        console.error(err);
    }

    // Enviar log detallado
    sendAutoModLog(guild, user, `Progressive (${moduleName}) - Strike ${strikeCount}`, reasonText, content, '#ff6600');
    return executed;
}
// ============================================================

const normalize = (text) => {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/);
};

// ============================================================
// SISTEMA ANTI-BYPASS ULTRA AVANZADO PARA NIVEL 3
// Detecta leet speak, caracteres repetidos, inserciones de símbolos,
// sustituciones múltiples, números confusos, etc.
// ============================================================
const bypassCheck = (text) => {
    let processed = text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""); // elimina acentos

    // Tabla de reemplazos leet (multiples pasadas para combos como "c0d3" -> "code")
    const leetMap = new Map([
        ['0', 'o'], ['1', 'i'], ['1', 'l'], // 1 puede ser i o l
        ['2', 'z'], ['3', 'e'], ['4', 'a'], ['5', 's'],
        ['6', 'b'], ['6', 'g'], // 6 puede ser b o g
        ['7', 't'], ['8', 'b'], ['9', 'g'], ['9', 'q'],
        ['@', 'a'], ['$', 's'], ['¡', 'i'], ['!', 'i'],
        ['#', 'h'], ['+', 't'], ['<', 'c'], ['>', 'c'],
        ['(', 'c'], [')', 'c'], ['&', 'e'], ['%', 'o'],
        ['*', 'x'], ['v', 'u'], ['\\|', 'l'], ['\\[', 'l'], ['\\]', 'l']
    ]);

    // Aplicar reemplazos múltiples veces hasta que no cambie (para casos como "c0d3")
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 5) {
        changed = false;
        for (const [leet, letter] of leetMap) {
            const regex = new RegExp(leet, 'g');
            const newText = processed.replace(regex, letter);
            if (newText !== processed) {
                processed = newText;
                changed = true;
            }
        }
        iterations++;
    }

    // Eliminar cualquier carácter que NO sea letra a-z o número
    // Esto hace que "p.a.l.a.b.r.a" o "pa-la-bra" se conviertan en "palabra"
    processed = processed.replace(/[^a-z0-9]/g, '');

    // Colapsar letras repetidas consecutivas (ej: "pppaaalllabra" -> "palabra")
    // pero manteniendo al menos una ocurrencia
    processed = processed.replace(/([a-z])\1{2,}/g, (match, char) => {
        // si se repite más de 2 veces, lo dejamos con una sola
        return char;
    });

    // Extra: también colapsar números repetidos (menos común, pero por si acaso)
    processed = processed.replace(/([0-9])\1{2,}/g, (match, num) => num);

    return processed;
};

const sendAutoModLog = (guild, user, action, reason, content, color = '#ff9900') => {
    const conf = localConfig.get(guild.id);
    if (!conf || !conf.log_channel) return;
    const logChannel = guild.channels.cache.get(conf.log_channel);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`Auto-Mod | ${action}`)
            .setDescription(`**Usuario:** ${user.tag} (${user.id})\n**Razón:** ${reason}\n**Contenido:** \`\`\`${content.substring(0, 500) || "N/A"}\`\`\``)
            .setColor(color)
            .setFooter({ text: `User ID: ${user.id}` })
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
};

client.once(Events.ClientReady, async () => {
    console.log(`Warden Systems v5.2 [ANTI-FLOOD ADDED] | Online`);

    const commands = [
        {
            name: 'eval',
            description: '[OWNER ONLY] Execute JavaScript code',
            options: [{ name: 'code', type: 3, description: 'Code to run', required: true }]
        },
        { 
            name: 'blacklist', 
            description: '[OWNER ONLY] Manage global blacklist', 
            options: [
                { name: 'action', type: 3, description: 'Add or Remove', required: true, choices: [{name: 'Add', value: 'add'}, {name: 'Remove', value: 'remove'}] },
                { name: 'user', type: 6, description: 'Target user', required: true },
                { name: 'reason', type: 3, description: 'Reason for blacklist', required: false }
            ] 
        },
        {
            name: 'badwords-add',
            description: 'Block a specific word or phrase',
            options: [
                { name: 'word', type: 3, description: 'Word to forbid', required: true },
                { name: 'level', type: 4, description: 'Sensitivity Level', required: true, choices: [
                    { name: 'Level 1: Exact Match', value: 1 },
                    { name: 'Level 2: Includes/Partial', value: 2 },
                    { name: 'Level 3: Ultra (Anti-Bypass)', value: 3 }
                ]}
            ]
        },
        {
            name: 'badwords-remove',
            description: 'Unblock a word',
            options: [{ name: 'word', type: 3, description: 'Word to allow', required: true }]
        },
        { name: 'badwords-list', description: 'View the list of forbidden words' },
        {
            name: 'setup-antilinks',
            description: 'Enable or disable the Anti-Link system',
            options: [{ name: 'enabled', type: 5, description: 'True to enable, False to disable', required: true }]
        },
        {
            name: 'link-whitelist-add',
            description: 'Allow a specific domain (e.g. youtube.com)',
            options: [{ name: 'domain', type: 3, description: 'The domain to whitelist', required: true }]
        },
        {
            name: 'link-whitelist-remove',
            description: 'Remove a domain from whitelist',
            options: [{ name: 'domain', type: 3, description: 'The domain to remove', required: true }]
        },
        { name: 'link-whitelist-list', description: 'List all whitelisted domains' },
        { 
            name: 'broadcast', 
            description: '[OWNER ONLY] Global Announcement', 
            options: [
                { name: 'message', type: 3, description: 'Announcement text', required: true },
                { name: 'title', type: 3, description: 'Embed title', required: false }
            ] 
        },
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'set-logs', description: 'Setup logs channel', options: [{ name: 'channel', type: 7, description: 'Channel', required: true }] },
        { 
            name: 'setup-antispam', 
            description: 'Configure Anti-Spam settings', 
            options: [
                { name: 'limit', type: 4, description: 'Message limit', required: true },
                { name: 'seconds', type: 4, description: 'Time window', required: true },
                { name: 'immune_role', type: 8, description: 'Role that bypasses anti-spam', required: false }
            ] 
        },
        { 
            name: 'setup-antiflood', 
            description: 'Configure Anti-Flood (Repeated messages)', 
            options: [
                { name: 'max_duplicates', type: 4, description: 'Max allowed identical messages', required: true },
                { name: 'enabled', type: 5, description: 'Enable Anti-Flood', required: true }
            ] 
        },
        { 
            name: 'slowmode', 
            description: 'Set channel slowmode', 
            options: [
                { name: 'seconds', type: 4, description: 'Seconds (0 to disable)', required: true },
                { name: 'reason', type: 3, description: 'Reason for slowmode', required: false }
            ] 
        },
        { name: 'audit', description: 'User security analysis', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        { name: 'ban', description: 'Ban user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'kick', description: 'Kick user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'role-give', description: 'Add role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { 
            name: 'create-role', 
            description: 'Role creator', 
            options: [
                { name: 'name', type: 3, description: 'Role name', required: true },
                { name: 'color', type: 3, description: 'Hex color', required: false },
                { name: 'level', type: 3, description: 'Tier', choices: [
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
        { 
            name: 'purge', 
            description: 'Delete messages with optional user filter', 
            options: [
                { name: 'amount', type: 4, description: 'Messages to scan (max 100)', required: true },
                { name: 'user', type: 6, description: 'Specific user to clean', required: false }
            ] 
        },
        {
            name: 'purge-after',
            description: 'Delete all messages sent after a specific Message ID',
            options: [{ name: 'message_id', type: 3, description: 'The ID of the message to start cleaning from', required: true }]
        },
        { name: 'lock', description: 'Full channel lockdown', options: [{ name: 'reason', type: 3, description: 'Reason for lockdown', required: false }] },
        { name: 'unlock', description: 'Unlock channel interactions', options: [{ name: 'reason', type: 3, description: 'Reason for unlock', required: false }] },
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
        },
        // ========== NUEVO COMANDO ANTI-ALT ==========
        {
            name: 'setup-anti-alt',
            description: 'Configure Anti-Alt (block new accounts)',
            options: [
                { name: 'enabled', type: 5, description: 'Enable or disable the system', required: true },
                { name: 'min_days', type: 4, description: 'Minimum account age in days (default: 7)', required: false }
            ]
        },
        // ========== NUEVO COMANDO MOD-STATUS ==========
        {
            name: 'mod-status',
            description: 'View the status of all auto-moderation modules'
        },
        // ========== NUEVO COMANDO PROGRESSIVE PUNISHMENT ==========
        {
            name: 'setup-progressive',
            description: 'Enable/Disable progressive punishment system (strikes with decay)',
            options: [
                { name: 'enabled', type: 5, description: 'True to enable, False to disable', required: true }
            ]
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

client.on(Events.GuildMemberAdd, async (member) => {
    // Blacklist global (ya existente)
    if (blacklistedUsers.has(member.id)) {
        await member.kick('Warden Global Blacklist').catch(() => null);
        sendAutoModLog(member.guild, member.user, 'Global Blacklist', 'User attempted to join while blacklisted.', 'N/A', '#000000');
        return;
    }

    // ========== NUEVO: ANTI-ALT ==========
    const config = localConfig.get(member.guild.id) || {};
    if (config.anti_alt_enabled) {
        // Excepciones: owner, administradores del servidor, o rol admin personalizado
        const isOwner = member.id === OWNER_ID;
        const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
        const isAdminRole = config.admin_role_id && member.roles.cache.has(config.admin_role_id);
        if (!isOwner && !isAdmin && !isAdminRole) {
            const minDays = config.anti_alt_min_days || 7;
            const accountAgeMs = Date.now() - member.user.createdTimestamp;
            const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);
            if (accountAgeDays < minDays) {
                const reason = `Account too new (${accountAgeDays.toFixed(1)} days < ${minDays} days required)`;
                await member.kick(`Anti-Alt: ${reason}`).catch(() => null);
                sendAutoModLog(member.guild, member.user, 'Anti-Alt Auto-Kick', reason, 'N/A', '#ff0000');
                return;
            }
        }
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id)) return; 
    if (message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false, flood_enabled: false, flood_max: 3 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    // ========== INTEGRACIÓN DE CASTIGOS PROGRESIVOS ==========
    const progressiveEnabled = config.progressive_enabled || false;

    // --- ANTI-FLOOD ---
    if (config.flood_enabled) {
        const userFlood = floodMap.get(message.author.id) || { lastContent: "", count: 0 };
        if (message.content === userFlood.lastContent && message.content.length > 2) {
            userFlood.count++;
            if (userFlood.count >= (config.flood_max || 3)) {
                userFlood.count = 0;
                if (progressiveEnabled) {
                    // Usar sistema progresivo
                    await applyProgressivePunishment(message.guild, message.author, "Anti-Flood", message, message.content);
                    return message.channel.send(`<:bankick_icon1:1504606705596498032> ${message.author}, you have been penalized for flooding.`).then(m => setTimeout(() => m.delete(), 5000)).catch(() => null);
                } else {
                    // Código original
                    await message.delete().catch(() => null);
                    await message.member.timeout(300000, 'Anti-Flood: Repetitive messages');
                    sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Repetitive messages (Flood)', message.content);
                    return message.channel.send(`<:bankick_icon1:1504606705596498032> ${message.author}, stop flooding with the same message.`);
                }
            }
        } else {
            userFlood.lastContent = message.content;
            userFlood.count = 1;
        }
        floodMap.set(message.author.id, userFlood);
    }

    // --- ANTI-LINKS ---
    if (config.antilinks_enabled) {
        const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        if (linkRegExp.test(message.content)) {
            const whitelist = linkWhitelist.get(message.guild.id) || new Set();
            const foundLinks = message.content.match(linkRegExp);

            let shouldDelete = false;
            for (const link of foundLinks) {
                try {
                    const url = new URL(link);
                    const domain = url.hostname.replace('www.', '');
                    if (!whitelist.has(domain)) { shouldDelete = true; break; }
                } catch (e) { shouldDelete = true; break; }
            }

            if (shouldDelete) {
                if (progressiveEnabled) {
                    await applyProgressivePunishment(message.guild, message.author, "Anti-Link", message, message.content);
                    return message.channel.send(`<:bankick_icon1:1504606705596498032> ${message.author}, links are not allowed here.`).then(m => setTimeout(() => m.delete(), 3000)).catch(() => null);
                } else {
                    await message.delete().catch(() => null);
                    sendAutoModLog(message.guild, message.author, 'Anti-Link', 'Unauthorized link posted.', message.content);
                    return message.channel.send(`<:bankick_icon1:1504606705596498032> ${message.author}, links are not allowed here.`)
                        .then(m => setTimeout(() => m.delete(), 3000));
                }
            }
        }
    }

    // --- BADWORDS (WORD FILTER) ---
    const serverWordsMap = forbiddenWords.get(message.guild.id);
    if (serverWordsMap && serverWordsMap.size > 0) {
        const messageWords = normalize(message.content);
        const ultraClean = bypassCheck(message.content);

        let detected = false;
        let detectedWord = "";
        for (const [forbidden, level] of serverWordsMap) {
            const cleanForbidden = forbidden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

            if (level === 1 && messageWords.includes(cleanForbidden)) detected = true;
            if (level === 2 && message.content.toLowerCase().includes(cleanForbidden)) detected = true;
            if (level === 3 && ultraClean.includes(bypassCheck(cleanForbidden))) detected = true;

            if (detected) { detectedWord = forbidden; break; }
        }

        if (detected) {
            if (progressiveEnabled) {
                await applyProgressivePunishment(message.guild, message.author, `Word Filter (${detectedWord})`, message, message.content);
                return message.channel.send(`<:warn_icon1:1504605302878769272> ${message.author}, that word is restricted here.`).then(m => setTimeout(() => m.delete(), 3000)).catch(() => null);
            } else {
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Word Filter', `Restricted word detected: ${detectedWord}`, message.content, '#ff4444');
                return message.channel.send(`<:warn_icon1:1504605302878769272> ${message.author}, that word is restricted here.`)
                    .then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // --- ANTI-SPAM ---
    const now = Date.now();
    const windowMs = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;

    if (!spamMap.has(message.author.id)) {
        spamMap.set(message.author.id, { count: 1, lastMessage: now });
        return;
    }

    const userData = spamMap.get(message.author.id);
    if (now - userData.lastMessage < windowMs) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;

    if (userData.count >= limit) {
        userData.count = 0;
        if (progressiveEnabled) {
            await applyProgressivePunishment(message.guild, message.author, "Anti-Spam", message, `Spammed ${limit} messages in ${config.spam_seconds}s`);
            // Opcional: también borrar los mensajes del usuario en el canal (similar a la acción original)
            try {
                const msgs = await message.channel.messages.fetch({ limit: 15 });
                const userMsgs = msgs.filter(m => m.author.id === message.author.id);
                if (userMsgs.size > 0) await message.channel.bulkDelete(userMsgs, true).catch(() => null);
            } catch (err) { console.error('Error deleting spam messages:', err); }
            return message.channel.send(`<:bankick_icon1:1504606705596498032> **Warden:** ${message.author} has been penalized for spamming.`).then(m => setTimeout(() => m.delete(), 5000)).catch(() => null);
        } else {
            try {
                const msgs = await message.channel.messages.fetch({ limit: 15 });
                await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
                await message.member.timeout(600000, 'Anti-Spam Triggered');
                sendAutoModLog(message.guild, message.author, 'Anti-Spam', `Sent ${limit} messages too quickly.`, 'N/A');
                message.channel.send(`<:bankick_icon1:1504606705596498032> **Warden:** ${message.author} muted for spamming.`);
            } catch (err) { console.error('Anti-spam error ignored.'); }
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel, user } = interaction;

    if (blacklistedUsers.has(user.id)) return; 

    const isOwner = user.id === OWNER_ID;
    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed', 'badwords-list', 'link-whitelist-list', 'mod-status'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const sendGlobalLog = (desc, color) => {
        const conf = localConfig.get(guild.id);
        if (!conf || !conf.log_channel) return;
        const logChannel = guild.channels.cache.get(conf.log_channel);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setDescription(`${desc}\n\n**Mod:** ${member.user.tag}\n**Canal:** ${channel}`)
                .setColor(color)
                .setFooter({ text: `Mod ID: ${member.user.id}` })
                .setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
    };

    const quickEmbed = (desc, color = '#ffffff', logIt = false) => {
        if (logIt) sendGlobalLog(desc, color);
        return interaction.editReply({ 
            embeds: [new EmbedBuilder().setDescription(desc).setColor(color)] 
        }).catch(() => null);
    };

    // --- BADWORDS COMMANDS ---
    if (commandName.startsWith('badwords')) {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageMessages) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('<:error_icon1:1504603932058714123> You do not have permission to manage the filter.', '#ff0000');

        let currentWordsMap = forbiddenWords.get(guild.id) || new Map();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            const level = options.getInteger('level');
            currentWordsMap.set(word, level);
            forbiddenWords.set(guild.id, currentWordsMap);
            return quickEmbed(`<:bankick_icon1:1504606705596498032> **Word Filter Updated** — \`${word}\` blocked at **Level ${level}**.`, '#2ecc71', true);
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Word Filter Updated** — \`${word}\` is no longer blocked.`, '#3498db', true);
            }
            return quickEmbed('<:error_icon1:1504603932058714123> That word was not in the list.', '#ff0000');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries())
                .map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'No blocked words found.';
            return quickEmbed(`**Word Filter List**\n\n${list}`, '#f1c40f');
        }
    }

    // --- LINK WHITELIST & SETUP COMMANDS ---
    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks' || commandName === 'setup-antiflood') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed('<:error_icon1:1504603932058714123> Requires Manage Server permissions.', '#ff0000');

        if (commandName === 'setup-antiflood') {
            const isEnabled = options.getBoolean('enabled');
            const maxDup = options.getInteger('max_duplicates');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), flood_enabled: isEnabled, flood_max: maxDup });
            return quickEmbed(`<:check_icon1:1504601887247171605> **Anti-Flood Updated** — ${isEnabled ? 'Enabled' : 'Disabled'}, limit: **${maxDup}** repeated messages.`, isEnabled ? '#2ecc71' : '#e74c3c', true);
        }

        if (commandName === 'setup-antilinks') {
            const isEnabled = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isEnabled });
            return quickEmbed(`<:check_icon1:1504601887247171605> **Anti-Link Updated** — The system is now ${isEnabled ? '**enabled**' : '**disabled**'}.`, isEnabled ? '#2ecc71' : '#e74c3c', true);
        }

        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();

        if (commandName === 'link-whitelist-add') {
            const domain = options.getString('domain').toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            currentWhitelist.add(domain);
            linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed(`<:check_icon1:1504601887247171605> **Link Whitelist Updated** — \`${domain}\` is now allowed.`, '#2ecc71', true);
        }
        if (commandName === 'link-whitelist-remove') {
            const domain = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(domain)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Link Whitelist Updated** — \`${domain}\` removed.`, '#e74c3c', true);
            }
            return quickEmbed('<:error_icon1:1504603932058714123> Domain not found in whitelist.', '#ff0000');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'No domains whitelisted.';
            return quickEmbed(`**Link Whitelist**\n\n${list}`, '#3498db');
        }
    }

    // --- NUEVO COMANDO SETUP-ANTI-ALT ---
    if (commandName === 'setup-anti-alt') {
        const config = localConfig.get(guild.id) || {};
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('<:error_icon1:1504603932058714123> Requires Manage Server permissions.', '#ff0000');

        const enabled = options.getBoolean('enabled');
        let minDays = options.getInteger('min_days');
        if (minDays === null || minDays === undefined) {
            // Si no se especifica, mantener el valor actual o poner 7 por defecto
            minDays = config.anti_alt_min_days !== undefined ? config.anti_alt_min_days : 7;
        } else if (minDays < 0) {
            return quickEmbed('<:error_icon1:1504603932058714123> Minimum days cannot be negative.', '#ff0000');
        }

        localConfig.set(guild.id, { ...config, anti_alt_enabled: enabled, anti_alt_min_days: minDays });
        return quickEmbed(
            `<:check_icon1:1504601887247171605> **Anti-Alt Configuration**\n` +
            `System: **${enabled ? 'Enabled' : 'Disabled'}**\n` +
            `Minimum account age: **${minDays} day(s)**\n` +
            `(New users with accounts younger than this will be auto-kicked)`,
            '#2ecc71', true
        );
    }

    // --- NUEVO COMANDO MOD-STATUS ---
    if (commandName === 'mod-status') {
        const config = localConfig.get(guild.id) || {};

        // Anti-Spam
        const spamLimit = config.spam_limit || 5;
        const spamSeconds = config.spam_seconds || 5;
        const spamStatus = (spamLimit && spamSeconds) ? '🟢' : '🔴';

        // Anti-Flood
        const floodEnabled = config.flood_enabled || false;
        const floodMax = config.flood_max || 3;
        const floodStatus = floodEnabled ? '🟢' : '🔴';

        // Anti-Links
        const antilinksEnabled = config.antilinks_enabled || false;
        const antilinksStatus = antilinksEnabled ? '🟢' : '🔴';

        // Anti-Alt
        const antiAltEnabled = config.anti_alt_enabled || false;
        const antiAltMinDays = config.anti_alt_min_days || 7;
        const antiAltStatus = antiAltEnabled ? '🟢' : '🔴';

        // Word Filter
        const wordsMap = forbiddenWords.get(guild.id) || new Map();
        const wordCount = wordsMap.size;
        const wordStatus = wordCount > 0 ? '🟢' : '🔴';

        // Slowmode (canal actual)
        const currentSlowmode = channel.rateLimitPerUser || 0;
        const slowmodeStatus = currentSlowmode > 0 ? `🟢 (${currentSlowmode}s)` : '🔴 (0s)';

        // Progressive Punishment
        const progressiveEnabled = config.progressive_enabled || false;
        const progressiveStatus = progressiveEnabled ? '🟢 (Active)' : '🔴 (Inactive)';

        // Configuración adicional
        const adminRoleId = config.admin_role_id;
        const adminRole = adminRoleId ? guild.roles.cache.get(adminRoleId)?.name || 'Unknown' : 'Not set';
        const logChannelId = config.log_channel;
        const logChannelStatus = logChannelId ? `<#${logChannelId}>` : 'Not set';

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Warden Auto-Moderation Status')
            .setColor('#2ecc71')
            .setDescription('Current status of all protection modules')
            .addFields(
                { name: '📊 Anti-Spam', value: `${spamStatus} **${spamLimit}** messages / **${spamSeconds}s**`, inline: true },
                { name: '🌊 Anti-Flood', value: `${floodStatus} **${floodMax}** duplicates (${floodEnabled ? 'on' : 'off'})`, inline: true },
                { name: '🔗 Anti-Links', value: `${antilinksStatus} ${antilinksEnabled ? 'Active' : 'Disabled'}`, inline: true },
                { name: '🆕 Anti-Alt', value: `${antiAltStatus} ${antiAltEnabled ? `${antiAltMinDays} days min` : 'Disabled'}`, inline: true },
                { name: '📝 Word Filter', value: `${wordStatus} **${wordCount}** blocked words`, inline: true },
                { name: '⏱️ Slowmode (this channel)', value: slowmodeStatus, inline: true },
                { name: '⚙️ Progressive Punishment', value: progressiveStatus, inline: true },
                { name: '👑 Admin Role', value: adminRole, inline: true },
                { name: '📋 Log Channel', value: logChannelStatus, inline: true }
            )
            .setFooter({ text: `Server: ${guild.name}` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }

    // --- NUEVO COMANDO SETUP-PROGRESSIVE ---
    if (commandName === 'setup-progressive') {
        const config = localConfig.get(guild.id) || {};
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('<:error_icon1:1504603932058714123> Requires Manage Server permissions.', '#ff0000');

        const enabled = options.getBoolean('enabled');
        localConfig.set(guild.id, { ...config, progressive_enabled: enabled });
        return quickEmbed(
            `<:check_icon1:1504601887247171605> **Progressive Punishment System**\n` +
            `Now **${enabled ? 'Enabled' : 'Disabled'}**\n` +
            `(Strikes decay after 24h: 1st → delete, 2nd → warn, 3rd → 5min timeout, 4th+ → increasing timeouts)`,
            enabled ? '#2ecc71' : '#e74c3c', true
        );
    }

    // --- MASTER COMMAND: EVAL ---
    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed('<:error_icon1:1504603932058714123> Direct Terminal Access is restricted to the System Developer.', '#ff0000');

        try {
            const code = options.getString('code');
            let evalued = await eval(code);

            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });

            if (evalued.includes(client.token) || evalued.includes(TOKEN)) {
                evalued = "Error: Output contains sensitive bot tokens. Execution blocked.";
            }

            const evalEmbed = new EmbedBuilder()
                .setDescription(`**Input:**\n\`\`\`js\n${code}\n\`\`\`\n**Output:**\n\`\`\`js\n${evalued.substring(0, 1014)}\n\`\`\``)
                .setColor('#2ecc71');

            return interaction.editReply({ embeds: [evalEmbed] });
        } catch (e) {
            return quickEmbed(`\`\`\`js\n${e.message}\n\`\`\``, '#e74c3c');
        }
    }

    // --- OWNER COMMAND: BLACKLIST ---
    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed('<:error_icon1:1504603932058714123> Restricted to System Developer.', '#ff0000');
        const action = options.getString('action');
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'No reason specified';

        if (action === 'add') {
            if (target.id === OWNER_ID) return quickEmbed('<:error_icon1:1504603932058714123> You cannot blacklist yourself.', '#ff0000');
            blacklistedUsers.add(target.id);
            return quickEmbed(`<:bankick_icon1:1504606705596498032> **Global Blacklist** — **${target.tag}** has been blacklisted.\n**Reason:** ${reason}`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed(`<:check_icon1:1504601887247171605> **Global Blacklist** — **${target.tag}** is no longer blacklisted.`, '#2ecc71');
        }
    }

    // --- OWNER COMMAND: BROADCAST ---
    if (commandName === 'broadcast') {
        if (!isOwner) return quickEmbed('<:error_icon1:1504603932058714123> This command is restricted to the System Developer.', '#ff0000');
        const bMsg = options.getString('message');
        const bTitle = options.getString('title') || 'Warden Systems: Global Announcement';

        let successCount = 0;
        client.guilds.cache.forEach(g => {
            const conf = localConfig.get(g.id);
            const targetChannel = g.channels.cache.get(conf?.log_channel) || g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.SendMessages));

            if (targetChannel) {
                const bEmbed = new EmbedBuilder()
                    .setDescription(`**${bTitle}**\n\n${bMsg}`)
                    .setColor('#f1c40f')
                    .setFooter({ text: 'Broadcast by System Owner' })
                    .setTimestamp();
                targetChannel.send({ embeds: [bEmbed] }).catch(() => null);
                successCount++;
            }
        });
        return quickEmbed(`<:check_icon1:1504601887247171605> **Broadcast Sent** — Delivered to **${successCount}** servers.`, '#2ecc71');
    }

    const config = localConfig.get(guild.id);
    const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));

    if (!['audit', 'flip', 'color', 'embed', 'badwords-list', 'link-whitelist-list', 'mod-status'].includes(commandName) && !hasAuth) {
        return quickEmbed('<:error_icon1:1504603932058714123> Unauthorized access.', '#ff0000');
    }

    try {
        switch (commandName) {
            case 'slowmode':
                const seconds = options.getInteger('seconds');
                const sReason = options.getString('reason') || 'No reason provided';
                await channel.setRateLimitPerUser(seconds, sReason);
                return quickEmbed(`<:timeout_icon1:1504605891087958147> **Slowmode Updated** — Set to **${seconds}** seconds.\n**Reason:** ${sReason}`, '#3498db', true);

            case 'purge':
                const pAmount = Math.min(options.getInteger('amount'), 100);
                const pTarget = options.getUser('user');
                const pFetched = await channel.messages.fetch({ limit: pAmount });
                let pToDelete = pTarget ? pFetched.filter(m => m.author.id === pTarget.id) : pFetched;
                if (pToDelete.size === 0) throw new Error('No messages found to delete.');
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Purge Complete** — Deleted **${pDeleted.size}** messages${pTarget ? ` from **${pTarget.tag}**` : ' from the channel'}.`, '#95a5a6', true);

            case 'purge-after':
                const msgId = options.getString('message_id');
                const paFetched = await channel.messages.fetch({ after: msgId, limit: 100 });
                if (paFetched.size === 0) throw new Error('No messages found after this ID.');
                const paDeleted = await channel.bulkDelete(paFetched, true);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Purge Complete** — Deleted **${paDeleted.size}** messages after ID: \`${msgId}\`.`, '#95a5a6', true);

            case 'setup-antispam':
                const saLimit = options.getInteger('limit');
                const saSeconds = options.getInteger('seconds');
                const saImmune = options.getRole('immune_role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), spam_limit: saLimit, spam_seconds: saSeconds, immune_role_id: saImmune?.id || null });
                return quickEmbed(`<:check_icon1:1504601887247171605> **Anti-Spam Updated** — Limit: **${saLimit}** msgs / **${saSeconds}s**\n**Immune Role:** ${saImmune || 'None'}`, '#2ecc71', true);

            case 'create-role':
                const rName = options.getString('name');
                const rColor = options.getString('color') || '#95a5a6';
                const rLevel = options.getString('level');
                let perms = []; let hoist = false;
                switch (rLevel) {
                    case 'member': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]; break;
                    case 'moderator': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers]; hoist = true; break;
                    case 'senior_mod': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.BanMembers]; hoist = true; break;
                    case 'administrator': perms = [PermissionFlagsBits.Administrator]; hoist = true; break;
                    case 'developer': perms = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild]; hoist = true; break;
                    default: perms = [PermissionFlagsBits.ViewChannel]; break;
                }
                const newRole = await guild.roles.create({ name: rName, color: rColor.startsWith('#') ? rColor : '#95a5a6', permissions: perms, hoist: hoist });
                return quickEmbed(`<:check_icon1:1504601887247171605> **Role Created** — **${newRole.name}**\n**Tier:** ${rLevel || 'Decoration'} · **Color:** ${newRole.hexColor}`, newRole.hexColor, true);

            case 'set-admin-role':
                const role = options.getRole('role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: role.id });
                return quickEmbed(`<:check_icon1:1504601887247171605> **Config Updated** — Admin role set to **${role.name}**.`, '#2ecc71');

            case 'set-logs':
                const logChan = options.getChannel('channel');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: logChan.id });
                return quickEmbed(`<:check_icon1:1504601887247171605> **Config Updated** — Logs will be sent to ${logChan}.`, '#3498db');

            case 'ban':
                const bUser = options.getUser('user');
                const bMember = await guild.members.fetch(bUser.id).catch(() => null);
                if (!isOwner && bMember && bMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('<:error_icon1:1504603932058714123> You cannot ban a user with an equal or higher role.', '#ff0000');
                }
                const bReason = options.getString('reason') || 'No reason provided';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed(`<:bankick_icon1:1504606705596498032> **Ban Applied** — **${bUser.tag}** has been banned.\n**Reason:** ${bReason}`, '#ff0000', true);

            case 'unban':
                const uId = options.getString('user_id');
                const uReason = options.getString('reason') || 'No reason provided';
                await guild.members.unban(uId, uReason);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Unban Applied** — ID \`${uId}\` has been unbanned.\n**Reason:** ${uReason}`, '#2ecc71', true);

            case 'kick':
                const kMember = options.getMember('user');
                if (!kMember || !kMember.kickable) throw new Error('Cannot kick this user.');
                if (!isOwner && kMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('<:error_icon1:1504603932058714123> You cannot kick a user with an equal or higher role.', '#ff0000');
                }
                const kReason = options.getString('reason') || 'No reason provided';
                await kMember.kick(kReason);
                return quickEmbed(`<:bankick_icon1:1504606705596498032> **Kick Applied** — **${kMember.user.tag}** has been kicked.\n**Reason:** ${kReason}`, '#e67e22', true);

            case 'warn':
                const wUser = options.getUser('user');
                const wMember = await guild.members.fetch(wUser.id).catch(() => null);
                if (!isOwner && wMember && wMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('<:error_icon1:1504603932058714123> You cannot warn a user with an equal or higher role.', '#ff0000');
                }
                const warns = localWarns.get(wUser.id) || [];
                const wReason = options.getString('reason') || 'No reason provided';
                warns.push({ date: new Date().toLocaleDateString(), reason: wReason });
                localWarns.set(wUser.id, warns);
                return quickEmbed(`<:warn_icon1:1504605302878769272> **Warning Issued** — **${wUser.tag}** has been warned.\n**Reason:** ${wReason}\n**Total Warnings:** ${warns.length}`, '#f1c40f', true);

            case 'infractions':
                const iUser = options.getUser('user');
                const iHistory = localWarns.get(iUser.id) || [];
                const iList = iHistory.map((w, i) => `**${i+1}.** [${w.date}] ${w.reason}`).join('\n') || 'No infractions found.';
                return quickEmbed(`**Infraction History — ${iUser.tag}**\n\n${iList}`, '#3498db');

            case 'timeout':
                const tMember = options.getMember('user');
                if (!tMember || !tMember.manageable) throw new Error('Cannot mute this user.');
                if (!isOwner && tMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('<:error_icon1:1504603932058714123> You cannot mute a user with an equal or higher role.', '#ff0000');
                }
                const tMin = options.getInteger('minutes');
                const tReason = options.getString('reason') || 'No reason provided';
                await tMember.timeout(tMin * 60000, tReason);
                return quickEmbed(`<:timeout_icon1:1504605891087958147> **Timeout Applied** — **${tMember.user.tag}** muted for **${tMin} minute(s)**.\n**Reason:** ${tReason}`, '#e67e22', true);

            case 'unmute':
                const umMember = options.getMember('user');
                if (!isOwner && umMember && umMember.roles.highest.position >= member.roles.highest.position) {
                    return quickEmbed('<:error_icon1:1504603932058714123> You cannot unmute a user with an equal or higher role.', '#ff0000');
                }
                const umReason = options.getString('reason') || 'No reason provided';
                await umMember?.timeout(null, umReason);
                return quickEmbed(`<:check_icon1:1504601887247171605> **Timeout Removed** — **${umMember?.user.tag}** has been unmuted.\n**Reason:** ${umReason}`, '#2ecc71', true);

            case 'lock':
            case 'unlock':
                const isLock = commandName === 'lock';
                const lockReason = options.getString('reason') || 'No reason provided';
                await channel.permissionOverwrites.edit(guild.roles.everyone, {
                    SendMessages: !isLock,
                    AddReactions: !isLock,
                    CreatePublicThreads: !isLock,
                    CreatePrivateThreads: !isLock,
                    SendMessagesInThreads: !isLock,
                    UseExternalEmojis: !isLock,
                    UseExternalStickers: !isLock
                });
                return quickEmbed(
                    isLock
                        ? `<:bankick_icon1:1504606705596498032> **Channel Locked** — **${channel.name}** is now read-only.\n**Reason:** ${lockReason}`
                        : `<:check_icon1:1504601887247171605> **Channel Unlocked** — **${channel.name}** interactions restored.\n**Reason:** ${lockReason}`,
                    isLock ? '#ff0000' : '#2ecc71', true
                );

            case 'audit':
                const aTarget = options.getMember('user');
                if (!aTarget) throw new Error('User not found.');
                const accountAgeDays = Math.floor((Date.now() - aTarget.user.createdTimestamp) / 86400000);
                const joinedServerDays = Math.floor((Date.now() - aTarget.joinedTimestamp) / 86400000);
                const joinedDiscordStr = accountAgeDays > 365 ? `${Math.floor(accountAgeDays / 365)} years ago` : `${accountAgeDays} days ago`;
                const joinedServerStr = joinedServerDays < 1 ? "today" : (joinedServerDays > 30 ? `${Math.floor(joinedServerDays / 30)} months ago` : `${joinedServerDays} days ago`);

                const auditEmbed = new EmbedBuilder()
                    .setAuthor({ name: `Audit Report: ${aTarget.user.username}`, iconURL: aTarget.user.displayAvatarURL() })
                    .setThumbnail('https://i.imgur.com/8Nf9yUn.png') 
                    .setColor(accountAgeDays > 30 ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: 'User ID', value: `**${aTarget.user.id}**` },
                        { name: 'Highest Role', value: `${aTarget.roles.highest}` },
                        { name: 'Admin Perms', value: `**${aTarget.permissions.has(PermissionFlagsBits.Administrator) ? 'Yes' : 'No'}**` },
                        { name: 'Joined Discord', value: `**${joinedDiscordStr}**` },
                        { name: 'Joined Server', value: `**${joinedServerStr}**` },
                        { name: 'Security Status', value: accountAgeDays > 30 ? '<:check_icon1:1504601887247171605> **SAFE**' : '<:warn_icon1:1504605302878769272> **SUSPICIOUS**' }
                    )
                    .setFooter({ text: `Account Age: ${accountAgeDays} days` })
                    .setTimestamp();
                return interaction.editReply({ embeds: [auditEmbed] });

            case 'role-give':
            case 'role-take':
                const rgMember = options.getMember('user');
                const rgRole = options.getRole('role');
                if (!isOwner) {
                    if (rgMember.roles.highest.position >= member.roles.highest.position) {
                        return quickEmbed('<:error_icon1:1504603932058714123> You cannot modify roles of a user with an equal or higher role.', '#ff0000');
                    }
                    if (rgRole.position >= member.roles.highest.position) {
                        return quickEmbed('<:error_icon1:1504603932058714123> You cannot manage a role that is equal or higher than yours.', '#ff0000');
                    }
                }
                if (commandName === 'role-give') {
                    await rgMember.roles.add(rgRole);
                    return quickEmbed(`<:check_icon1:1504601887247171605> **Role Given** — **${rgRole.name}** given to **${rgMember.user.tag}**.`, '#3498db', true);
                } else {
                    await rgMember.roles.remove(rgRole);
                    return quickEmbed(`<:check_icon1:1504601887247171605> **Role Removed** — **${rgRole.name}** removed from **${rgMember.user.tag}**.`, '#3498db', true);
                }

            case 'create-channel':
                const cType = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
                const cTypeName = options.getString('type') === 'text' ? 'text' : 'voice';
                const newChan = await guild.channels.create({ name: options.getString('name'), type: cType });
                return quickEmbed(`<:check_icon1:1504601887247171605> **Channel Created** — New **${cTypeName}** channel: ${newChan}`, '#2ecc71', true);

            case 'color':
                const cHex = options.getString('input');
                return quickEmbed(`**Color Info** — **${cHex}**`, cHex.startsWith('#') ? cHex : '#ffffff');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply({ content: 'Message sent.' });

            case 'flip':
                const flipResult = Math.random() > 0.5 ? 'Heads' : 'Tails';
                return quickEmbed(`**Coin Flip** — **${flipResult}**`, '#f1c40f');

            case 'embed':
                const customEmbed = new EmbedBuilder().setDescription(options.getString('description')).setColor(options.getString('color') || '#ffffff');
                if (options.getString('title')) customEmbed.setTitle(options.getString('title'));
                return interaction.editReply({ embeds: [customEmbed] });

            default:
                return quickEmbed('<:error_icon1:1504603932058714123> Command not found.', '#7289da');
        }
    } catch (err) {
        console.error(err);
        return quickEmbed(`<:error_icon1:1504603932058714123> Failed: \`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('Rejection:', r));
process.on('uncaughtException', e => console.error('Exception:', e));

client.login(TOKEN);