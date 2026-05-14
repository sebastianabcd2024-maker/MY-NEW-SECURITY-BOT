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

// --- LOCAL STORAGE ---
const localConfig = new Map(); 
const localWarns = new Map();
const spamMap = new Map(); 
const floodMap = new Map(); 
const blacklistedUsers = new Set(); 
const forbiddenWords = new Map(); 
const linkWhitelist = new Map(); 

// --- HELPER: NORMALIZATION ---
const normalize = (text) => {
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9\s]/g, "")    
        .split(/\s+/);                  
};

// --- HELPER: ANTI-BYPASS ---
const bypassCheck = (text) => {
    return text.toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't')
        .replace(/8/g, 'b').replace(/v/g, 'u').replace(/\W|_/g, '');
};

// --- HELPER: AUTOMOD LOGGING (LOGS COMPLETOS) ---
const sendAutoModLog = (guild, user, action, reason, content, color = '#ff9900') => {
    const conf = localConfig.get(guild.id);
    if (!conf || !conf.log_channel) return;
    const logChannel = guild.channels.cache.get(conf.log_channel);
    if (logChannel) {
        const logEmbed = new EmbedBuilder()
            .setAuthor({ name: `Auto-Mod | ${action}`, iconURL: user.displayAvatarURL() })
            .setColor(color)
            .addFields(
                { name: '👤 Usuario', value: `**${user.tag}** (\`${user.id}\`)`, inline: true },
                { name: '📝 Razón', value: reason, inline: true },
                { name: '💬 Contenido Detectado', value: `\`\`\`${content.substring(0, 500) || "N/A"}\`\`\`` }
            )
            .setFooter({ text: `Canal: #${content.channel?.name || 'Automod'}` })
            .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
    }
};

// --- COMMAND REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems Online | Estética Dyno Aplicada`);

    const commands = [
        {
            name: 'eval',
            description: '[OWNER] Ejecutar código JS',
            options: [{ name: 'code', type: 3, description: 'Código', required: true }]
        },
        { 
            name: 'blacklist', 
            description: '[OWNER] Lista negra global', 
            options: [
                { name: 'action', type: 3, description: 'Acción', required: true, choices: [{name: 'Añadir', value: 'add'}, {name: 'Quitar', value: 'remove'}] },
                { name: 'user', type: 6, description: 'Usuario', required: true },
                { name: 'reason', type: 3, description: 'Razón', required: false }
            ] 
        },
        {
            name: 'badwords-add',
            description: 'Bloquear palabra',
            options: [
                { name: 'word', type: 3, description: 'Palabra', required: true },
                { name: 'level', type: 4, description: 'Sensibilidad', required: true, choices: [
                    { name: 'Nivel 1: Exacto', value: 1 },
                    { name: 'Nivel 2: Parcial', value: 2 },
                    { name: 'Nivel 3: Anti-Bypass', value: 3 }
                ]}
            ]
        },
        {
            name: 'badwords-remove',
            description: 'Desbloquear palabra',
            options: [{ name: 'word', type: 3, description: 'Palabra', required: true }]
        },
        { name: 'badwords-list', description: 'Lista de palabras prohibidas' },
        {
            name: 'setup-antilinks',
            description: 'Configurar Anti-Links',
            options: [{ name: 'enabled', type: 5, description: 'Estado', required: true }]
        },
        {
            name: 'link-whitelist-add',
            description: 'Autorizar dominio (ej: youtube.com)',
            options: [{ name: 'domain', type: 3, description: 'Dominio', required: true }]
        },
        {
            name: 'link-whitelist-remove',
            description: 'Quitar dominio de whitelist',
            options: [{ name: 'domain', type: 3, description: 'Dominio', required: true }]
        },
        { name: 'link-whitelist-list', description: 'Dominios autorizados' },
        { 
            name: 'broadcast', 
            description: '[OWNER] Anuncio Global', 
            options: [
                { name: 'message', type: 3, description: 'Mensaje', required: true },
                { name: 'title', type: 3, description: 'Título', required: false }
            ] 
        },
        { name: 'set-admin-role', description: 'Rol administrador del bot', options: [{ name: 'role', type: 8, description: 'Rol', required: true }] },
        { name: 'set-logs', description: 'Canal de registros', options: [{ name: 'channel', type: 7, description: 'Canal', required: true }] },
        { 
            name: 'setup-antispam', 
            description: 'Configurar Anti-Spam', 
            options: [
                { name: 'limit', type: 4, description: 'Límite mensajes', required: true },
                { name: 'seconds', type: 4, description: 'Segundos', required: true },
                { name: 'immune_role', type: 8, description: 'Rol inmune', required: false }
            ] 
        },
        { 
            name: 'setup-antiflood', 
            description: 'Configurar Anti-Flood', 
            options: [
                { name: 'max_duplicates', type: 4, description: 'Máximo repetidos', required: true },
                { name: 'enabled', type: 5, description: 'Estado', required: true }
            ] 
        },
        { 
            name: 'slowmode', 
            description: 'Modo lento', 
            options: [
                { name: 'seconds', type: 4, description: 'Segundos', required: true },
                { name: 'reason', type: 3, description: 'Razón', required: false }
            ] 
        },
        { name: 'audit', description: 'Análisis de seguridad', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'ban', description: 'Banear usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'unban', description: 'Desbanear ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }] },
        { name: 'kick', description: 'Expulsar usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'timeout', description: 'Mutear usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'minutes', type: 4, description: 'Minutos', required: true }, { name: 'reason', type: 3, description: 'Razón' }] },
        { name: 'unmute', description: 'Quitar mute', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'warn', description: 'Advertir usuario', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'reason', type: 3, description: 'Razón', required: true }] },
        { name: 'infractions', description: 'Historial', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }] },
        { name: 'role-give', description: 'Dar rol', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'role', type: 8, description: 'Rol', required: true }] },
        { name: 'role-take', description: 'Quitar rol', options: [{ name: 'user', type: 6, description: 'Usuario', required: true }, { name: 'role', type: 8, description: 'Rol', required: true }] },
        { 
            name: 'create-role', 
            description: 'Creador de roles', 
            options: [
                { name: 'name', type: 3, description: 'Nombre', required: true },
                { name: 'color', type: 3, description: 'Color Hex', required: false },
                { name: 'level', type: 3, description: 'Tipo', choices: [
                    { name: 'Decorativo', value: 'decoration' }, { name: 'Miembro', value: 'member' },
                    { name: 'Moderador', value: 'moderator' }, { name: 'Senior Mod', value: 'senior_mod' },
                    { name: 'Admin', value: 'administrator' }, { name: 'Dev', value: 'developer' }
                ]}
            ] 
        },
        { name: 'create-channel', description: 'Crear canal', options: [
            { name: 'name', type: 3, description: 'Nombre', required: true },
            { name: 'type', type: 3, description: 'Tipo', required: true, choices: [{ name: 'Texto', value: 'text' }, { name: 'Voz', value: 'voice' }] }
        ]},
        { 
            name: 'purge', 
            description: 'Limpiar mensajes', 
            options: [
                { name: 'amount', type: 4, description: 'Cantidad (máx 100)', required: true },
                { name: 'user', type: 6, description: 'Usuario específico', required: false }
            ] 
        },
        {
            name: 'purge-after',
            description: 'Limpiar mensajes tras un ID',
            options: [{ name: 'message_id', type: 3, description: 'ID del mensaje', required: true }]
        },
        { name: 'lock', description: 'Cerrar canal' },
        { name: 'unlock', description: 'Abrir canal' },
        { name: 'color', description: 'Info color', options: [{ name: 'input', type: 3, description: 'Hex/Nombre', required: true }] },
        { name: 'echo', description: 'Hablar como bot', options: [{ name: 'text', type: 3, description: 'Texto', required: true }] },
        { name: 'flip', description: 'Cara o cruz' },
        { 
            name: 'embed', 
            description: 'Generar embed', 
            options: [
                { name: 'description', type: 3, description: 'Contenido', required: true },
                { name: 'title', type: 3, description: 'Título' },
                { name: 'color', type: 3, description: 'Color Hex' },
                { name: 'thumbnail', type: 3, description: 'URL Miniatura' },
                { name: 'image', type: 3, description: 'URL Imagen' }
            ] 
        }
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- PROTECCIÓN ---
client.on(Events.GuildMemberAdd, async (member) => {
    if (blacklistedUsers.has(member.id)) {
        await member.kick('🛡️ Warden Global Blacklist').catch(() => null);
        sendAutoModLog(member.guild, member.user, 'Global Blacklist', 'Usuario en lista negra intentó entrar.', 'N/A', '#000000');
    }
});

// --- AUTOMOD LOGIC ---
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (blacklistedUsers.has(message.author.id)) return; 
    if (message.author.id === OWNER_ID) return; 

    const config = localConfig.get(message.guild.id) || { spam_limit: 5, spam_seconds: 5, antilinks_enabled: false, flood_enabled: false, flood_max: 3 };
    const isAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator);
    const isImmuneRole = config.immune_role_id && message.member?.roles.cache.has(config.immune_role_id);
    const isAdminRole = config.admin_role_id && message.member?.roles.cache.has(config.admin_role_id);

    if (isAdmin || isImmuneRole || isAdminRole) return;

    if (config.flood_enabled) {
        const userFlood = floodMap.get(message.author.id) || { lastContent: "", count: 0 };
        if (message.content === userFlood.lastContent && message.content.length > 2) {
            userFlood.count++;
            if (userFlood.count >= (config.flood_max || 3)) {
                userFlood.count = 0;
                await message.delete().catch(() => null);
                await message.member.timeout(300000, 'Anti-Flood: Repetición excesiva');
                sendAutoModLog(message.guild, message.author, 'Anti-Flood', 'Mensajes repetidos', message.content);
                return message.channel.send(`**${message.author.username}**, no repitas el mismo mensaje.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        } else {
            userFlood.lastContent = message.content;
            userFlood.count = 1;
        }
        floodMap.set(message.author.id, userFlood);
    }

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
                await message.delete().catch(() => null);
                sendAutoModLog(message.guild, message.author, 'Anti-Link', 'Link no autorizado.', message.content);
                return message.channel.send(`**${message.author.username}**, los enlaces externos no están permitidos.`).then(m => setTimeout(() => m.delete(), 3000));
            }
        }
    }

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
            await message.delete().catch(() => null);
            sendAutoModLog(message.guild, message.author, 'Filtro Palabras', `Palabra restringida: ${detectedWord}`, message.content, '#ff4444');
            return message.channel.send(`**${message.author.username}**, cuida tu lenguaje.`).then(m => setTimeout(() => m.delete(), 3000));
        }
    }

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
        try {
            const msgs = await message.channel.messages.fetch({ limit: 15 });
            await message.channel.bulkDelete(msgs.filter(m => m.author.id === message.author.id), true);
            await message.member.timeout(600000, 'Anti-Spam Triggered');
            sendAutoModLog(message.guild, message.author, 'Anti-Spam', `${limit} mensajes demasiado rápido.`, 'N/A');
            message.channel.send(`🛡️ **Warden:** ${message.author} ha sido silenciado por spam.`);
        } catch (err) { console.error('Spam catch error'); }
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

    const sendGlobalLog = (title, desc, color) => {
        const conf = localConfig.get(guild.id);
        if (!conf || !conf.log_channel) return;
        const logChannel = guild.channels.cache.get(conf.log_channel);
        if (logChannel) {
            const logEmbed = new EmbedBuilder()
                .setAuthor({ name: `Moderación | ${title}`, iconURL: user.displayAvatarURL() })
                .setDescription(desc)
                .addFields(
                    { name: '🛡️ Moderador', value: `**${user.tag}**`, inline: true },
                    { name: '📍 Canal', value: `${channel}`, inline: true }
                )
                .setColor(color).setTimestamp();
            logChannel.send({ embeds: [logEmbed] }).catch(() => null);
        }
    };

    const quickEmbed = (title, desc, color = '#5865f2', logIt = false) => {
        if (logIt) sendGlobalLog(title, desc, color);
        // Dyno Style: Título en negrita y descripción limpia
        const embed = new EmbedBuilder().setDescription(`**${title}**\n${desc}`).setColor(color);
        return interaction.editReply({ embeds: [embed] }).catch(() => null);
    };

    // --- COMMANDS ---
    if (commandName.startsWith('badwords')) {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageMessages) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('Acceso Denegado', 'No tienes permisos de moderación.', '#f04747');
        let currentWordsMap = forbiddenWords.get(guild.id) || new Map();

        if (commandName === 'badwords-add') {
            const word = options.getString('word').toLowerCase();
            const level = options.getInteger('level');
            currentWordsMap.set(word, level);
            forbiddenWords.set(guild.id, currentWordsMap);
            return quickEmbed('Filtro Actualizado', `La palabra \`${word}\` ha sido bloqueada (Nvl ${level}).`, '#43b581', true);
        }
        if (commandName === 'badwords-remove') {
            const word = options.getString('word').toLowerCase();
            if (currentWordsMap.delete(word)) {
                forbiddenWords.set(guild.id, currentWordsMap);
                return quickEmbed('Filtro Actualizado', `La palabra \`${word}\` ha sido permitida.`, '#5865f2', true);
            }
            return quickEmbed('Error', 'Esa palabra no está en el filtro.', '#f04747');
        }
        if (commandName === 'badwords-list') {
            const list = Array.from(currentWordsMap.entries()).map(([w, l]) => `• \`${w}\` (Lvl ${l})`).join('\n') || 'Filtro vacío.';
            return quickEmbed('Palabras Prohibidas', list);
        }
    }

    if (commandName.startsWith('link-whitelist') || commandName === 'setup-antilinks' || commandName === 'setup-antiflood') {
        const config = localConfig.get(guild.id);
        const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.ManageGuild) || (config && member.roles.cache.has(config.admin_role_id));
        if (commandName !== 'link-whitelist-list' && !hasAuth) return quickEmbed('Acceso Denegado', 'Permisos insuficientes.', '#f04747');

        if (commandName === 'setup-antiflood') {
            const isEnabled = options.getBoolean('enabled');
            const maxDup = options.getInteger('max_duplicates');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), flood_enabled: isEnabled, flood_max: maxDup });
            return quickEmbed('Configuración Anti-Flood', `Sistema ${isEnabled ? '**Activado**' : '**Desactivado**'} | Máx: ${maxDup} repetidos.`, isEnabled ? '#43b581' : '#f04747', true);
        }

        if (commandName === 'setup-antilinks') {
            const isEnabled = options.getBoolean('enabled');
            localConfig.set(guild.id, { ...localConfig.get(guild.id), antilinks_enabled: isEnabled });
            return quickEmbed('Configuración Anti-Links', `Sistema ${isEnabled ? '**Activado**' : '**Desactivado**'}.`, isEnabled ? '#43b581' : '#f04747', true);
        }

        let currentWhitelist = linkWhitelist.get(guild.id) || new Set();
        if (commandName === 'link-whitelist-add') {
            const domain = options.getString('domain').toLowerCase().replace('https://', '').replace('http://', '').replace('www.', '').split('/')[0];
            currentWhitelist.add(domain);
            linkWhitelist.set(guild.id, currentWhitelist);
            return quickEmbed('Whitelist Enlaces', `Dominio \`${domain}\` autorizado.`, '#43b581', true);
        }
        if (commandName === 'link-whitelist-remove') {
            const domain = options.getString('domain').toLowerCase();
            if (currentWhitelist.delete(domain)) {
                linkWhitelist.set(guild.id, currentWhitelist);
                return quickEmbed('Whitelist Enlaces', `Dominio \`${domain}\` eliminado.`, '#f04747', true);
            }
            return quickEmbed('Error', 'Dominio no encontrado.', '#f04747');
        }
        if (commandName === 'link-whitelist-list') {
            const list = Array.from(currentWhitelist).map(d => `• \`${d}\``).join('\n') || 'Sin dominios.';
            return quickEmbed('Enlaces Autorizados', list);
        }
    }

    if (commandName === 'eval') {
        if (!isOwner) return quickEmbed('Error Crítico', 'Acceso restringido al desarrollador.', '#f04747');
        try {
            const code = options.getString('code');
            let evalued = await eval(code);
            if (typeof evalued !== "string") evalued = require("util").inspect(evalued, { depth: 0 });
            if (evalued.includes(TOKEN)) evalued = "Acceso a Token denegado.";
            const evalEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Terminal de Sistema' })
                .addFields(
                    { name: '📥 Entrada', value: `\`\`\`js\n${code}\n\`\`\`` },
                    { name: '📤 Salida', value: `\`\`\`js\n${evalued.substring(0, 1000)}\n\`\`\`` }
                ).setColor('#43b581');
            return interaction.editReply({ embeds: [evalEmbed] });
        } catch (e) { return quickEmbed('Error de Consola', `\`\`\`js\n${e.message}\n\`\`\``, '#f04747'); }
    }

    if (commandName === 'blacklist') {
        if (!isOwner) return quickEmbed('Acceso Denegado', 'Permiso denegado.', '#f04747');
        const action = options.getString('action');
        const target = options.getUser('user');
        const reason = options.getString('reason') || 'Sin razón';
        if (action === 'add') {
            if (target.id === OWNER_ID) return quickEmbed('Error', 'No puedes banear al dueño.', '#f04747');
            blacklistedUsers.add(target.id);
            return quickEmbed('Lista Negra Global', `**${target.tag}** añadido.\nMotivo: ${reason}`, '#000000');
        } else {
            blacklistedUsers.delete(target.id);
            return quickEmbed('Lista Negra Global', `**${target.tag}** eliminado.`, '#43b581');
        }
    }

    if (commandName === 'broadcast') {
        if (!isOwner) return quickEmbed('Acceso Denegado', 'Solo desarrollador.', '#f04747');
        const bMsg = options.getString('message');
        const bTitle = options.getString('title') || 'Anuncio de Sistema';
        let successCount = 0;
        client.guilds.cache.forEach(g => {
            const conf = localConfig.get(g.id);
            const targetChannel = g.channels.cache.get(conf?.log_channel) || g.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(g.members.me).has(PermissionFlagsBits.SendMessages));
            if (targetChannel) {
                const bEmbed = new EmbedBuilder().setTitle(bTitle).setDescription(bMsg).setColor('#faa61a').setTimestamp();
                targetChannel.send({ embeds: [bEmbed] }).catch(() => null);
                successCount++;
            }
        });
        return quickEmbed('Anuncio Global', `Enviado a **${successCount}** servidores.`, '#43b581');
    }

    const config = localConfig.get(guild.id);
    const hasAuth = isOwner || member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));

    if (!['audit', 'flip', 'color', 'embed', 'badwords-list', 'link-whitelist-list'].includes(commandName) && !hasAuth) {
        return quickEmbed('Acceso Denegado', 'No tienes permisos de administrador.', '#f04747');
    }

    try {
        switch (commandName) {
            case 'slowmode':
                const seconds = options.getInteger('seconds');
                await channel.setRateLimitPerUser(seconds);
                return quickEmbed('Modo Lento', `Canal actualizado a **${seconds}s**.`, '#5865f2', true);

            case 'purge':
                const pAmount = Math.min(options.getInteger('amount'), 100);
                const pTarget = options.getUser('user');
                const pFetched = await channel.messages.fetch({ limit: pAmount });
                let pToDelete = pTarget ? pFetched.filter(m => m.author.id === pTarget.id) : pFetched;
                const pDeleted = await channel.bulkDelete(pToDelete, true);
                return quickEmbed('Limpieza', `Se han eliminado **${pDeleted.size}** mensajes.`, '#4f545c', true);

            case 'setup-antispam':
                const saLimit = options.getInteger('limit');
                const saSeconds = options.getInteger('seconds');
                const saImmune = options.getRole('immune_role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), spam_limit: saLimit, spam_seconds: saSeconds, immune_role_id: saImmune?.id || null });
                return quickEmbed('Anti-Spam', `Límite: ${saLimit} msgs / ${saSeconds}s.`, '#43b581', true);

            case 'create-role':
                const rName = options.getString('name');
                const rColor = options.getString('color') || '#99aab5';
                const rLevel = options.getString('level');
                let perms = []; let hoist = false;
                switch (rLevel) {
                    case 'member': perms = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]; break;
                    case 'moderator': perms = [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers]; hoist = true; break;
                    case 'administrator': perms = [PermissionFlagsBits.Administrator]; hoist = true; break;
                    default: perms = [PermissionFlagsBits.ViewChannel]; break;
                }
                const newRole = await guild.roles.create({ name: rName, color: rColor.startsWith('#') ? rColor : '#99aab5', permissions: perms, hoist: hoist });
                return quickEmbed('Rol Creado', `Nuevo rol: ${newRole}`, newRole.hexColor, true);

            case 'set-admin-role':
                const role = options.getRole('role');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), admin_role_id: role.id });
                return quickEmbed('Configuración', `Rol administrativo: **${role.name}**`, '#43b581');

            case 'set-logs':
                const logChan = options.getChannel('channel');
                localConfig.set(guild.id, { ...localConfig.get(guild.id), log_channel: logChan.id });
                return quickEmbed('Configuración', `Canal de logs: ${logChan}`, '#5865f2');

            case 'ban':
                const bUser = options.getUser('user');
                const bReason = options.getString('reason') || 'Sin razón';
                await guild.members.ban(bUser, { reason: bReason });
                return quickEmbed('Usuario Baneado', `**${bUser.tag}** ha sido expulsado permanentemente.`, '#f04747', true);

            case 'unban':
                const uId = options.getString('user_id');
                await guild.members.unban(uId);
                return quickEmbed('Usuario Desbaneado', `ID \`${uId}\` ha sido perdonada.`, '#43b581', true);

            case 'kick':
                const kMember = options.getMember('user
