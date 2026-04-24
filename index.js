const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes, ChannelType 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] 
});

const APP_ID = "1495239262579195986"; 

// --- 1. FULL COMMAND REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v3.2 | The Full Arsenal Online`);
    
    const commands = [
        // Security & Settings
        { name: 'set-admin-role', description: 'Setup admin role', options: [{ name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'audit', description: 'User security analysis', options: [{ name: 'user', type: 6, description: 'User', required: true }] },
        
        // Moderation (The ones I missed!)
        { name: 'ban', description: 'Ban user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unban', description: 'Unban ID', options: [{ name: 'user_id', type: 3, description: 'ID', required: true }] },
        { name: 'kick', description: 'Kick user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'timeout', description: 'Mute user', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove timeout', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'warn', description: 'Issue warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View history', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        
        // Management
        { name: 'role-give', description: 'Add role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'role-take', description: 'Remove role', options: [{ name: 'user', type: 6, description: 'User', required: true }, { name: 'role', type: 8, description: 'Role', required: true }] },
        { name: 'add-role', description: 'Create new role', options: [{ name: 'name', type: 3, description: 'Name', required: true }] },
        { name: 'create-channel', description: 'Create a channel', options: [
            { name: 'name', type: 3, description: 'Channel name', required: true },
            { name: 'type', type: 3, description: 'Text or Voice', required: true, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] }
        ]},
        { name: 'purge', description: 'Clear messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'slowmode', description: 'Set slowmode', options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }] },
        { name: 'lock', description: 'Lock channel' },
        { name: 'unlock', description: 'Unlock channel' },
        
        // Utility
        { name: 'investigate', description: 'Private isolation', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        { name: 'release', description: 'End investigation' },
        { name: 'embed', description: 'Create embed', options: [{ name: 'description', type: 3, description: 'Text', required: true }, { name: 'title', type: 3, description: 'Title' }, { name: 'color', type: 3, description: 'Hex/Name' }] },
        { name: 'color', description: 'Color info', options: [{ name: 'input', type: 3, description: 'Hex or Name (e.g. red)', required: true }] },
        { name: 'flip', description: 'Coin flip' },
        { name: 'echo', description: 'Bot speak', options: [{ name: 'text', type: 3, description: 'Text', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); } catch (e) { console.error(e); }
});

// --- 2. LOGIC HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const isPublic = ['audit', 'flip', 'color'].includes(commandName);
    await interaction.deferReply({ ephemeral: !isPublic });

    const quickEmbed = (title, description, color = '#ffffff') => {
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        return interaction.editReply({ embeds: [embed] });
    };

    // SECURITY CHECK
    if (!['audit', 'flip', 'color', 'set-admin-role'].includes(commandName)) {
        const { data: config } = await supabase.from('guild_settings').select('admin_role_id').eq('guild_id', guild.id).single();
        const hasAuth = member.permissions.has(PermissionFlagsBits.Administrator) || (config && member.roles.cache.has(config.admin_role_id));
        if (!hasAuth) return quickEmbed('❌ Access Denied', 'Unauthorized.', '#ff0000');
    }

    // --- COMMANDS LOGIC ---
    
    // Color & Flip
    if (commandName === 'color') {
        const input = options.getString('input').toLowerCase();
        const colors = { red: '#FF0000', blue: '#0000FF', green: '#00FF00', yellow: '#FFFF00', black: '#000000', white: '#FFFFFF' };
        const hex = colors[input] || (input.startsWith('#') ? input : `#${input}`);
        const embed = new EmbedBuilder().setTitle(`🎨 Color: ${input}`).setColor(hex.length === 7 ? hex : '#ffffff').addFields({ name: 'Hex Code', value: hex });
        return interaction.editReply({ embeds: [embed] });
    }

    if (commandName === 'flip') {
        return quickEmbed('🪙 Coin Flip', `Result: **${Math.random() > 0.5 ? 'Heads' : 'Tails'}**`, '#f1c40f');
    }

    // Moderation (Ban, Kick, Timeout, Warn, Unban)
    if (['ban', 'kick', 'timeout', 'unmute', 'warn'].includes(commandName)) {
        const target = options.getMember('user');
        const reason = options.getString('reason') || 'No reason provided.';
        if (target && !target.manageable) return quickEmbed('❌ Error', 'Hierarchy restriction.', '#ff0000');

        try {
            if (commandName === 'ban') await target.ban({ reason });
            if (commandName === 'kick') await target.kick(reason);
            if (commandName === 'timeout') await target.timeout(options.getInteger('minutes') * 60000, reason);
            if (commandName === 'unmute') await target.timeout(null);
            if (commandName === 'warn') await supabase.from('infractions').insert([{ user_id: target.id, guild_id: guild.id, reason }]);
            
            return quickEmbed(`🛑 Action: ${commandName.toUpperCase()}`, `**User:** ${target.user.tag}\n**Reason:** ${reason}`, '#ff0000');
        } catch (e) { return quickEmbed('❌ Error', 'Action failed.', '#ff0000'); }
    }

    if (commandName === 'unban') {
        const id = options.getString('user_id');
        await guild.members.unban(id);
        return quickEmbed('✅ Unbanned', `ID \`${id}\` has been unbanned.`, '#2ecc71');
    }

    if (commandName === 'infractions') {
        const target = options.getUser('user');
        const { data } = await supabase.from('infractions').select('*').eq('user_id', target.id).eq('guild_id', guild.id);
        const list = data?.map((w, i) => `**${i+1}.** ${w.reason}`).join('\n') || 'Clean record.';
        return quickEmbed(`📄 History: ${target.tag}`, list, '#3498db');
    }

    // Management (Roles, Channels, Purge, Slowmode)
    if (commandName === 'add-role') {
        const role = await guild.roles.create({ name: options.getString('name') });
        return quickEmbed('✅ Role Created', `Created: ${role.name}`, '#2ecc71');
    }

    if (commandName === 'create-channel') {
        const name = options.getString('name');
        const type = options.getString('type') === 'text' ? ChannelType.GuildText : ChannelType.GuildVoice;
        const newChan = await guild.channels.create({ name, type });
        return quickEmbed('✅ Channel Created', `New ${options.getString('type')} channel: ${newChan}`, '#2ecc71');
    }

    if (commandName === 'slowmode') {
        const sec = options.getInteger('seconds');
        await channel.setRateLimitPerUser(sec);
        return quickEmbed('⏳ Slowmode', `Set to ${sec}s`, '#34495e');
    }

    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        await channel.bulkDelete(amount, true);
        return quickEmbed('🧹 Purge', `Deleted ${amount} messages.`, '#95a5a6');
    }

    // Embed & Echo
    if (commandName === 'embed') {
        const emb = new EmbedBuilder().setDescription(options.getString('description')).setTitle(options.getString('title') || 'Announcement').setColor('#ffffff');
        return interaction.editReply({ embeds: [emb] });
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.editReply({ content: 'Delivered.' });
    }

    // (Include investigate/release/set-admin-role/lock/unlock as before...)
});

client.login(process.env.DISCORD_TOKEN);
