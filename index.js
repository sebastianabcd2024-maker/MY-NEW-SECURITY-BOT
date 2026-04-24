const { 
    Client, GatewayIntentBits, Events, EmbedBuilder, PermissionFlagsBits, REST, Routes 
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] 
});

const APP_ID = "1495239262579195986"; 

client.once(Events.ClientReady, async () => {
    console.log(`🛡️ Warden Systems v2.2 | Security & Utility Core Online`);
    
    const commands = [
        // Security Configuration
        { name: 'set-admin-role', description: 'Setup the role allowed to use bot commands', default_member_permissions: PermissionFlagsBits.Administrator.toString(), options: [{ name: 'role', type: 8, description: 'Admin role', required: true }] },
        
        // Utility & Fun (From Screenshot)
        { name: 'add-rank', description: 'Create a new server rank', options: [{ name: 'name', type: 3, description: 'Rank name', required: true }] },
        { name: 'add-role', description: 'Create a basic role', options: [{ name: 'name', type: 3, description: 'Role name', required: true }] },
        { name: 'color', description: 'Show Hex color information', options: [{ name: 'hex', type: 3, description: 'Hex code (e.g. #000000)', required: true }] },
        { name: 'flip', description: 'Flip a coin' },

        // Moderation & Cloud
        { name: 'warn', description: 'Issue a cloud-synced warning', options: [{ name: 'user', type: 6, description: 'Target', required: true }, { name: 'reason', type: 3, description: 'Reason', required: true }] },
        { name: 'purge', description: 'Delete a specific amount of messages', options: [{ name: 'amount', type: 4, description: 'Amount', required: true }] },
        { name: 'echo', description: 'Make the bot speak', options: [{ name: 'text', type: 3, description: 'Message content', required: true }] }
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try { 
        await rest.put(Routes.applicationCommands(APP_ID), { body: commands }); 
        console.log("✅ Warden Systems commands synced in English.");
    } catch (e) { console.error(e); }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild, member, channel } = interaction;

    const quickResponse = (title, description, color = '#ffffff', ephemeral = false) => {
        const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(color).setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral });
    };

    // --- ADMINISTRATIVE ROLE SECURITY CHECK ---
    if (commandName !== 'set-admin-role' && commandName !== 'echo') {
        const { data: config } = await supabase.from('guild_settings').select('admin_role_id').eq('guild_id', guild.id).single();
        
        const hasPermission = member.permissions.has(PermissionFlagsBits.Administrator) || 
                             (config && member.roles.cache.has(config.admin_role_id));

        if (!hasPermission) {
            return quickResponse('❌ Access Denied', 'You do not have the required Admin Role to use Warden Systems.', '#ff0000', true);
        }
    }

    // --- COMMAND LOGIC ---
    if (commandName === 'set-admin-role') {
        const role = options.getRole('role');
        const { error } = await supabase.from('guild_settings').upsert({ guild_id: guild.id, admin_role_id: role.id });
        if (error) return quickResponse('❌ Error', 'Could not save configuration to cloud.', '#ff0000', true);
        return quickResponse('✅ Configuration Updated', `Members with the **${role.name}** role can now use the bot.`, '#2ecc71');
    }

    if (commandName === 'add-rank' || commandName === 'add-role') {
        const name = options.getString('name');
        try {
            const newRole = await guild.roles.create({ name: name, reason: 'Warden Systems: add-rank command' });
            return quickResponse('✅ Role Created', `Successfully created role: **${newRole.name}**.`, '#2ecc71');
        } catch (e) { return quickResponse('❌ Error', 'Missing permissions to manage roles.', '#ff0000', true); }
    }

    if (commandName === 'color') {
        const hex = options.getString('hex').replace('#', '');
        const embed = new EmbedBuilder()
            .setTitle('🎨 Color Information')
            .addFields(
                { name: 'Hex', value: `#${hex.toUpperCase()}`, inline: true },
                { name: 'Preview', value: `Visual representation below`, inline: true }
            )
            .setColor(`#${hex}`)
            .setThumbnail(`https://singlecolorimage.com/get/${hex}/100x100`);
        return interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'flip') {
        const result = Math.random() > 0.5 ? 'Heads' : 'Tails';
        return quickResponse('🪙 Coin Flip', `The result is: **${result}**!`, '#f1c40f');
    }

    if (commandName === 'echo') {
        if (!member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: 'Permission denied.', ephemeral: true });
        await channel.send(options.getString('text'));
        return interaction.reply({ content: 'Message delivered.', ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
