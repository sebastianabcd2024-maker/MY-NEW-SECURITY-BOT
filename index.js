const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// --- 1. CLOUD CONNECTION (SUPABASE) ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers
    ] 
});

const APP_ID = "1495239262579195986"; 

// --- 2. GLOBAL COMMAND REGISTRATION ---
client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v2.1 | Global Cloud Core Online`);
    
    const commands = [
        // Moderation
        { name: 'ban', description: 'Ban a user from the server', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason for the ban' }] },
        { name: 'unban', description: 'Unban a user via ID', default_member_permissions: PermissionFlagsBits.BanMembers.toString(), options: [{ name: 'user_id', type: 3, description: 'User ID', required: true }, { name: 'reason', type: 3, description: 'Reason for the unban' }] },
        { name: 'kick', description: 'Kick a user from the server', default_member_permissions: PermissionFlagsBits.KickMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target user', required: true }, { name: 'reason', type: 3, description: 'Reason for the kick' }] },
        { name: 'timeout', description: 'Temporarily mute a user', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'minutes', type: 4, description: 'Duration in minutes', required: true }, { name: 'reason', type: 3, description: 'Reason' }] },
        { name: 'unmute', description: 'Remove active timeout', default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        
        // Cloud Infrastructure (Supabase)
        { name: 'warn', description: 'Issue a cloud-synced warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'infractions', description: 'View user history from the cloud', options: [{ name: 'user', type: 6, description: 'Target', required: true }] },
        
        // Roles & Utilities
        { name: 'role-give', description: 'Assign a role to a user', default_member_permissions: PermissionFlagsBits.ManageRoles.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role to add', required: true }] },
        { name: 'role-take', description: 'Remove a role from a user', default_member_permissions: PermissionFlagsBits.ManageRoles.toString(), options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'role', type: 8, description: 'Role to remove', required: true }] },
        { name: 'purge', description: 'Delete a specific amount of messages', default_member_permissions: PermissionFlagsBits.ManageMessages.toString(), options: [{ name: 'amount', type: 4, description: 'Amount of messages', required: true }] },
        { name: 'lock', description: 'Lock the current channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        { name: 'unlock', description: 'Unlock the current channel', default_member_permissions: PermissionFlagsBits.ManageChannels.toString() },
        
        // Professional Branding & Tools
        { 
            name: 'embed', 
            description: 'Create a professional announcement', 
            options: [
                { name: 'description', type: 3, description: 'Main content', required: true },
                { name: 'title', type: 3, description: 'Embed title' },
                { name: 'color', type: 3, description: 'Hex Color (e.g. #ffffff)' },
                { name: 'footer', type: 3, description: 'Footer text' },
                { name: 'image', type: 3, description: 'Image/Thumbnail URL' }
            ] 
        },
        { name: 'echo', description: 'Make the bot speak', options: [{ name: 'text', type: 3, description: 'Message content', required: true }] },
        { name: 'slowmode', description: 'Set channel slowmode', options: [{ name: 'seconds', type: 4, description: 'Seconds', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); 
        console.log("✅ Warden Systems global commands synced.");
    } catch (e) { console.error(e); }
});

// --- 3. INTERACTION HANDLER ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, channel } = interaction;

    // --- CLOUD OPERATIONS (WARN / INFRACTIONS) ---
    if (commandName === 'warn') {
        const target = options.getUser('user');
        const reason = options.getString('reason');
        const { error } = await supabase.from('infractions').insert([{ user_id: target.id, guild_id: guild.id, reason: reason }]);
        if (error) return interaction.reply({ content: '❌ Failed to connect to Nube guardiana.', ephemeral: true });
        return interaction.reply(`⚠️ **Warning issued to ${target.tag} (Cloud Synced)**.`);
    }

    if (commandName === 'infractions') {
        const target = options.getUser('user');
        const { data, error } = await supabase.from('infractions').select('*').eq('user_id', target.id).eq('guild_id', guild.id);
        if (error) return interaction.reply('❌ Cloud Fetch Error.');
        const embed = new EmbedBuilder().setTitle(`${target.tag}'s Record`).setColor('#ffffff')
            .setDescription(data.length ? data.map((w, i) => `**${i+1}.** [${new Date(w.created_at).toLocaleDateString()}] ${w.reason}`).join('\n') : '✅ User has a clean record.');
        return interaction.reply({ embeds: [embed] });
    }

    // --- MODERATION LOGIC ---
    if (['ban', 'unban', 'kick', 'timeout', 'unmute'].includes(commandName)) {
        await interaction.deferReply();
        const reason = options.getString('reason') || 'No reason provided.';
        try {
            if (commandName === 'unban') {
                await guild.members.unban(options.getString('user_id'), reason);
                return interaction.editReply(`✅ User ID **${options.getString('user_id')}** has been unbanned.`);
            }

            const target = options.getMember('user');
            if (!target.manageable) return interaction.editReply("❌ Permission denied: Hierarchy restriction.");
            
            if (commandName === 'ban') await target.ban({ reason });
            else if (commandName === 'kick') await target.kick(reason);
            else if (commandName === 'timeout') await target.timeout(options.getInteger('minutes') * 60000, reason);
            else if (commandName === 'unmute') await target.timeout(null);

            const embed = new EmbedBuilder().setTitle(`🛑 Action: ${commandName.toUpperCase()}`).setColor('#ff0000')
                .addFields({ name: 'User', value: target.user.tag }, { name: 'Reason', value: reason }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (e) { return interaction.editReply("❌ Operation failed. Check ID or permissions."); }
    }

    // --- ROLES & PERMISSIONS ---
    if (commandName === 'role-give' || commandName === 'role-take') {
        const target = options.getMember('user');
        const role = options.getRole('role');
        if (role.position >= guild.members.me.roles.highest.position) return interaction.reply("❌ Role position is too high.");
        commandName === 'role-give' ? await target.roles.add(role) : await target.roles.remove(role);
        return interaction.reply(`🎭 Role **${role.name}** updated for **${target.user.tag}**.`);
    }

    // --- CHANNEL MANAGEMENT ---
    if (commandName === 'purge') {
        const amount = options.getInteger('amount');
        await channel.bulkDelete(amount, true);
        return interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
    }

    if (commandName === 'lock' || commandName === 'unlock') {
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: commandName === 'unlock' });
        return interaction.reply(`🔒 Channel **${commandName.toUpperCase()}ED** successfully.`);
    }

    // --- PROFESSIONAL EMBED ENGINE ---
    if (commandName === 'embed') {
        const desc = options.getString('description');
        const title = options.getString('title');
        const color = options.getString('color') || '#ffffff';
        const footer = options.getString('footer');
        const image = options.getString('image');

        const embed = new EmbedBuilder()
            .setDescription(desc)
            .setColor(color.startsWith('#') ? color : `#${color}`);

        if (title) embed.setTitle(title);
        if (footer) embed.setFooter({ text: footer });
        if (image) embed.setThumbnail(image);

        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'echo') {
        await channel.send(options.getString('text'));
        return interaction.reply({ content: 'Message delivered.', ephemeral: true });
    }

    if (commandName === 'slowmode') {
        const sec = options.getInteger('seconds');
        await channel.setRateLimitPerUser(sec);
        return interaction.reply(`⏳ Slowmode set to **${sec}s**.`);
    }
});

client.login(process.env.DISCORD_TOKEN);
