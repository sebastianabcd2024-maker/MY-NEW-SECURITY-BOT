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

// --- STORAGE ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const floodMap = new Map(); 
const blacklistedUsers = new Set(); 
const forbiddenWords = new Map(); 
const linkWhitelist = new Map(); 

// --- HELPERS ---
const normalize = (text) => {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/);
};

const bypassCheck = (text) => {
    return text.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/8/g, 'b').replace(/v/g, 'u').replace(/\W|_/g, '');
};

const sendAutoModLog = (guild, user, action, reason, content, color = '#ff9900') => {
    const conf = localConfig.get(guild.id);
    if (!conf || !conf.log_channel) return;
    const logChannel = guild.channels.cache.get(conf.log_channel);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setTitle(`🛡️ Auto-Mod Action: ${action}`)
            .setColor(color)
            .addFields(
                { name: '👤 User', value: `${user.tag} (${user.id})`, inline: true },
                { name: '📝 Reason', value: reason, inline: true },
                { name: '💬 Content', value: `\`\`\`${content.substring(0, 500) || "N/A"}\`\`\`` }
            )
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
};

// --- COMMANDS ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v5.2 [ANTI-FLOOD ADDED] | Online`);

    const commands = [
        { name: 'eval', description: 'Ejecutar código JS (Owner)', options: [{ name: 'code', type: 3, description: 'Código', required: true }] },
        { name: 'blacklist', description: 'Gestionar lista negra global', options: [
            { name: 'action', type: 3, description: 'Acción', required: true, choices: [{name: 'Añadir', value: 'add'}, {name: 'Quitar', value: 'remove'}] },
            { name: 'user', type: 6, description: 'Usuario', required: true },
            { name: 'reason', type: 3, description: 'Razón', required: false }
        ]},
        { name: 'badwords-add', description: 'Bloquear una palabra', options: [
            { name: 'word', type: 3, description: 'Palabra', required: true },
            { name: 'level', type: 4, description: 'Sensibilidad', required: true, choices: [
                { name: 'Nivel 1: Exacto', value: 1 },
                { name: 'Nivel 2: Parcial', value: 2 },
                { name: 'Nivel 3: Anti-Bypass', value: 3 }
            ]}
        ]},
        { name: 'badwords-remove', description: 'Desbloquear palabra', options: [{ name: 'word', type: 3, description: 'Palabra', required: true }] },
        { name: 'badwords-list', description: 'Lista de palabras prohibidas' },
        { name: 'setup-antilinks', description: 'Configurar Anti-Links', options: [{ name: 'enabled', type: 5, description: 'Estado', required: true }] },
        { name: 'link-whitelist-add', description: 'Autorizar un dominio', options: [{ name: 'domain', type: 3, description: 'Dominio (ej: google.com)', required: true }] },
        { name: 'link-whitelist-remove', description: 'Remover dominio', options: [{ name: 'domain', type: 3, description: 'Dominio', required: true }] },
        { name: 'link-whitelist-list', description: 'Dominios permitidos' },
        { name: 'broadcast', description: 'Anuncio global (Owner)', options: [
            { name: 'message', type: 3, description: 'Mensaje', required: true },
            { name: 'title', type: 3, description: 'Título', required: false }
        ]},
        { name: 'set-admin-role', description: 'Configurar rol de admin', options: [{ name: 'role', type: 8, description: 'Rol', required: true }] },
        { name: 'set-logs', description: 'Configurar canal de logs', options: [{ name: 'channel', type: 7, description: 'Canal', required: true }] },
        { name: 'setup-antispam', description: 'Configurar Anti-Spam', options: [
            { name: 'limit', type: 4, description: 'Límite de mensajes', required: true },
            { name: 'seconds', type: 4, description: 'Ventana de tiempo (seg)', required: true },
            { name: 'immune_role', type: 8, description: 'Rol inmune', required: false }
        ]},
        { name: 'setup-antiflood', description: 'Configurar Anti-Flood', options: [
            { name: 'max_duplicates', type: 4, description: 'Máximo de repetidos', required: true },
            { name: 'enabled', type: 5, description: 'Estado', required: true }
        ]},
        { name: 'slowmode', description: 'Modo lento', options: [
            { name: 'seconds', type: 4, description: 'Segundos', required: true },
            { name: 'reason', type: 3, description: 'Razón', required: false }
        ]},
        { name: 'audit', description: 'Análisis de seguridad', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'ban', description: 'Banear usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'unban', description: 'Desbanear ID', options: [{ name: 'user_id', type: 3, description: 'ID de usuario', required: true }] },
        { name: 'kick', description: 'Expulsar usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'timeout', description: 'Silenciar usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'minutes', type: 4, description: 'Minutos', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'unmute', description: 'Quitar silencio', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'warn', description: 'Advertir usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón', required: true }] },
        { name: 'infractions', description: 'Ver historial', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'role-give', description: 'Dar rol', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'role', type: 8, description: 'Rol', required: true }] },
        { name: 'role-take', description: 'Quitar rol', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'role', type: 8, description: 'Rol', required: true }] },
        { name: 'create-role', description: 'Crear nuevo rol', options: [
            { name: 'name', type: 3, description: 'Nombre', required: true },
            { name: 'color', type: 3, description: 'Color Hex', required: false },
            { name: 'level', type: 3, description: 'Nivel de permisos', choices: [
                { name: 'Decoración', value: 'decoration' }, { name: 'Miembro', value: 'member' },
                { name: 'Moderador', value: 'moderator' }, { name: 'Moderador Senior', value: 'senior_mod' },
                { name: 'Administrador', value: 'administrator' }, { name: 'Desarrollador', value: 'developer' }
            ]}
        ]},
        { name: 'create-channel', description: 'Crear canal', options: [
            { name: 'name', type: 3, description: 'Nombre', required: true },
            { name: 'type', type: 3, description: 'Tipo', required: true, choices: [{ name: 'Texto', value: 'text' }, { name: 'Voz', value: 'voice' }] }
        ]},
        { name: 'purge', description: 'Limpiar mensajes', options: [
            { name: 'amount', type: 4, description: 'Cantidad (max 100)', required: true },
            { name: 'user', type: 6, description: 'Filtrar por usuario', required: false }
        ]},
        { name: 'purge-after', description: 'Limpiar desde un ID', options: [{ name: 'message_id', type: 3, description: 'ID de mensaje', required: true }] },
        { name: 'lock', description: 'Bloquear canal' },
        { name: 'unlock', description: 'Desbloquear canal' },
        { name: 'color', description: 'Info de color', options: [{ name: 'input', type: 3, description: 'Hex o Nombre', required: true }] },
        { name: 'echo', description: 'Repetir texto', options: [{ name: 'text', type: 3, description: 'Texto', required: true }] },
        { name: 'flip', description: 'Lanzar moneda' },
        { name: 'embed', description: 'Crear embed personalizado', options: [
            { name: 'description', type: 3, description: 'Contenido', required: true },
            { name: 'title', type: 3, description: 'Título' },
            { name: 'color', type: 3, description: 'Color Hex' },
            { name: 'thumbnail', type: 3, description: 'URL Miniatura' },
            { name: 'image', type: 3, description: 'URL Imagen' }
        ]}
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- EVENTS ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (blacklistedUsers.has(member.id)) {
        await member.kick('🛡️ Warden Global Blacklist').catch(() => null);
        sendAutoModLog(member.guild, member.user, 'Global Blacklist', 'Usuario intentó entrar estando en lista negra.', 'N/A', '#000000');
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id) || message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false, flood_enabled: false, flood_max: 3 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmune = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isModRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmune || isModRole) return;

    // Anti-Flood
    if (config.flood_enabled) {
        const userFlood = floodMap.get(message.author.id) || { lastContent: "", count: 0 };
        if (message.content === userFlood.lastContent && message.content.length > 2) {
            userFlood.count++;
            if (userFlood.count >= (config.flood_max || 3)) {
                userFlood.count = 0;
                await message.delete().catch(() => null);
                await message.member.timeout(300000, 'Anti-Flood: Repetición detectada');
                sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Mensajes repetidos (Flood)', message.content);
                return message.channel.send(`🚫 ${message.author}, deja de repetir el mismo mensaje.`);
            }
        } else {
            userFlood.lastContent = message.content;
            userFlood.count = 1;
        }
        floodMap.set(message.author.id, userFlood);
    }

    // Anti-Link
    if (config.antilinks_enabled) {
        const linkRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
        if (linkRegExp.test(message.content)) {
            const whitelist = linkWhitelist.get(message.guild.id) || new Set();
            const foundLinks = message.content.match(linkRegExp);
            let shouldDelete = false;

            for (const link of foundLinks) {
                try {
                    const domain = new URL(link).hostname.replace('www.', '');
                    if (!whitelist.has(domain)) { shouldDelete = true; break; }
                } catch { shouldDelete = true; break; }
            }

            if (shouldDelete) {
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Anti-Link', 'Link no autorizado.', message.content);
                return message.channel.send(`🚫 ${message.author}, los enlaces externos no están permitidos.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

    // Word Filter
    const serverWords = forbiddenWords.get(message.guild.id);
    if (serverWords?.size > 0) {
        const words = normalize(message.content);
        const clean = bypassCheck(message.content);
        let detected = false;
        let dWord = "";

        for (const [forbidden, level] of serverWords) {
            const cleanForbidden = forbidden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
            if (level === 1 && words.includes(cleanForbidden)) detected = true;
            if (level === 2 && message.content.toLowerCase().includes(cleanForbidden)) detected = true;
            if (level === 3 && clean.includes(bypassCheck(cleanForbidden))) detected = true;
            if (detected) { dWord = forbidden; break; }
        }

        if (detected) {
            await message.delete().catch(() => null);
            sendAutoModLog(message.guild, message.author, 'Filtro de Palabras', `Palabra prohibida: ${dWord}`, message.content, '#ff4444');
            return message.channel.send(`⚠️ ${message.author}, has usado una palabra restringida.`).then(m => setTimeout(() => m.delete(), 3000));
        }
    }

    // Anti-Spam
    const now = Date.now();
    const window = (config.spam_seconds || 5) * 1000;
    const limit = config.spam_limit || 5;
    const userData = spamMap.get(message.author.id) || { count: 0, lastMessage: 0 };

    if (now - userData.lastMessage < window) { userData.count++; } else { userData.count = 1; }
    userData.lastMessage = now;
    spamMap.set(message.author.id, userData);

    if (userData.count >= limit) {
        userData.count = 0;
        const msgs = await message.channel.messages.fetch({ limit: 15 });
        await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
        await message.member.timeout(600000, 'Anti-Spam Triggered');
        sendAutoModLog(message.guild, message.author, 'Anti-Spam', `Envió ${limit} mensajes demasiado rápido.`, 'N/A');
        message.channel.send(`🛡️ **Auto-Mod:** ${message.author} silenciado por spam.`);
    }
});

// --- INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel, user } = interaction;
    if (blacklistedUsers.has(user.id)) return; 

    const isOwner = user.id === OWNER_ID;
    const isPublic = ['audit', 'flip', 'color', 'infractions', 'ban', 'kick', 'warn', 'timeout', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const quickEmbed = (title, desc, color = '#ffffff', logIt = false) => {
        if (logIt) {
            const conf = localConfig.get(guild.id);
            const logChan = guild.channels.cache.get(conf?.log_channel);
            if (logChan) {
                const log = new EmbedBuilder().setTitle(`📝 Log: ${title}`).setDescription(`${desc}\n\n**Mod:** ${user.tag}`).setColor(color).setTimestamp();
                logChan.send({ embeds: [log] }).catch(() => null);
            }
        }
        return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color)] }).catch(() => null);
    };

    const config = localConfig.get(guild.id);
    const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));

    if (!isPublic && !hasAuth) return quickEmbed('❌ Denegado', 'No tienes permisos suficientes.', '#ff0000');

    try {
        switch (commandName) {
            case 'eval':
                if (!isOwner) return quickEmbed('❌ Error', 'Solo desarrollador.', '#ff0000');
                let evalued = await eval(options.getString('code'));
                if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
                if (evalued.includes(client.token)) return quickEmbed('❌ Bloqueado', 'Información sensible.', '#ff0000');
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💻 Console').addFields({ name: 'In', value: `\`\`\`js\n${options.getString('code')}\`\`\`` }, { name: 'Out', value: `\`\`\`js\n${evalued.substring(0, 1000)}\`\`\`` }).setColor('#2ecc71')] });

            case 'blacklist':
                if (!isOwner) return quickEmbed('❌ Denegado', 'Solo para el propietario.', '#ff0000');
                const blUser = options.getUser('user');
                if (options.getString('action') === 'add') {
                    blacklistedUsers.add(blUser.id);
                    return quickEmbed('🚫 Lista Negra', `${blUser.tag} ha sido vetado globalmente.`, '#000000');
                }
                blacklistedUsers.delete(blUser.id);
                return quickEmbed('✅ Removido', `${blUser.tag} ha sido rehabilitado.`, '#2ecc71');

            case 'badwords-add':
                let words = forbiddenWords.get(guild.id) || new Map();
                words.set(options.getString('word').toLowerCase(), options.getInteger('level'));
                forbiddenWords.set(guild.id, words);
                return quickEmbed('🚫 Filtro', `Palabra bloqueada (Lvl ${options.getInteger('level')}).`, '#2ecc71', true);

            case 'badwords-list':
                const bwList = Array.from(forbiddenWords.get(guild.id) || []).map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'Lista vacía.';
                return quickEmbed('📜 Filtro de Palabras', bwList, '#3498db');

            case 'setup-antilinks':
                localConfig.set(guild.id, { ...config, antilinks_enabled: options.getBoolean('enabled') });
                return quickEmbed('🔗 Anti-Links', `Sistema: **${options.getBoolean('enabled') ? 'Activado' : 'Desactivado'}**`, '#3498db', true);

            case 'setup-antiflood':
                localConfig.set(guild.id, { ...config, flood_enabled: options.getBoolean('enabled'), flood_max: options.getInteger('max_duplicates') });
                return quickEmbed('🛡️ Anti-Flood', `Configurado: **${options.getBoolean('enabled') ? 'Activado' : 'Desactivado'}** (Max: ${options.getInteger('max_duplicates')})`, '#2ecc71', true);

            case 'ban':
                const bUser = options.getUser('user');
                await guild.members.ban(bUser, { reason: options.getString('reason') || 'N/A' });
                return quickEmbed('🔨 Baneado', `${bUser.tag} ha sido expulsado permanentemente.`, '#ff0000', true);

            case 'purge':
                const deleted = await channel.bulkDelete(Math.min(options.getInteger('amount'), 100), true);
                return quickEmbed('🧹 Limpieza', `Se han eliminado **${deleted.size}** mensajes.`, '#95a5a6', true);

            case 'audit':
                const aUser = options.getMember('user');
                const age = Math.floor((Date.now() - aUser.user.createdTimestamp) / 86400000);
                const audit = new EmbedBuilder()
                    .setAuthor({ name: `Auditoría: ${aUser.user.tag}`, iconURL: aUser.user.displayAvatarURL() })
                    .setColor(age > 30 ? '#2ecc71' : '#ff0000')
                    .addFields(
                        { name: '🆔 ID', value: aUser.user.id, inline: true },
                        { name: '📅 Antigüedad', value: `${age} días`, inline: true },
                        { name: '🛡️ Estado', value: age > 30 ? '✅ Seguro' : '⚠️ Sospechoso' }
                    );
                return interaction.editReply({ embeds: [audit] });

            case 'warn':
                const wHistory = localWarns.get(options.getUser('user').id) || [];
                wHistory.push({ date: new Date().toLocaleDateString(), reason: options.getString('reason') });
                localWarns.set(options.getUser('user').id, wHistory);
                return quickEmbed('⚠️ Advertencia', `Usuario advertido. Total: **${wHistory.length}**`, '#f1c40f', true);

            case 'lock':
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
                return quickEmbed('🔐 Bloqueado', 'Este canal ha sido cerrado.', '#ff0000', true);

            case 'unlock':
                await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
                return quickEmbed('🔓 Desbloqueado', 'Canal abierto.', '#2ecc71', true);

            case 'set-logs':
                localConfig.set(guild.id, { ...config, log_channel: options.getChannel('channel').id });
                return quickEmbed('📁 Logs', `Canal de registro: ${options.getChannel('channel')}`, '#3498db');

            case 'echo':
                await channel.send(options.getString('text'));
                return interaction.editReply('Mensaje enviado.');

            case 'flip':
                return quickEmbed('🪙 Moneda', `Resultado: **${Math.random() > 0.5 ? 'Cara' : 'Cruz'}**`, '#f1c40f');

            default:
                return quickEmbed('❓ Error', 'Comando no reconocido.', '#ff0000');
        }
    } catch (err) {
        return quickEmbed('❌ Error de Sistema', `\`${err.message}\``, '#ff0000');
    }
});

process.on('unhandledRejection', r => console.error('🛡️ Rejection:', r));
process.on('uncaughtException', e => console.error('🛡️ Exception:', e));

client.login(TOKEN);
