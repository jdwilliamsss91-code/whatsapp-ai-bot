/**
 * ============================================================================
 * PROYECTO: WhatsApp AI Bot (Texto, Imágenes, Video, Música)
 * ARQUITECTURA: Node.js + whatsapp-web.js + Google Gemini API + yt-search
 * ============================================================================
 * 
 * Requisitos previos (Instalar dependencias en tu terminal):
 * npm init -y
 * npm install whatsapp-web.js qrcode-terminal axios yt-search
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const ytSearch = require('yt-search');
const express = require('express'); // 🚀 AÑADIDO: Necesario para que la nube no apague el bot

// ==========================================
// CONFIGURACIÓN DE APIs
// ==========================================
// ADVERTENCIA: En un entorno de producción, usa variables de entorno (.env)
const GEMINI_API_KEY = 'TU_API_KEY_DE_GEMINI_AQUI'; 

// ==========================================
// INICIALIZACIÓN DEL CLIENTE DE WHATSAPP
// ==========================================
// Usamos LocalAuth para guardar la sesión y no tener que escanear el QR siempre
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\nEscanea este código QR con tu aplicación de WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Sistema inicializado: El Bot de WhatsApp está en línea y listo.');
});

// ==========================================
// CONTROLADOR PRINCIPAL DE MENSAJES
// ==========================================
client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const textoMensaje = msg.body.trim().toLowerCase();

    try {
        // 1. MÓDULO DE INTELIGENCIA ARTIFICIAL (Información)
        // Comando: !ai [tu pregunta]
        if (textoMensaje.startsWith('!ai ')) {
            const prompt = msg.body.substring(4).trim();
            await chat.sendStateTyping(); // Muestra "Escribiendo..."
            
            const respuestaAI = await generarTextoGemini(prompt);
            await msg.reply(respuestaAI);
        }

        // 2. MÓDULO DE GENERACIÓN DE IMÁGENES
        // Comando: !img [descripción de la imagen]
        else if (textoMensaje.startsWith('!img ')) {
            const prompt = msg.body.substring(5).trim();
            await msg.reply('🎨 Generando imagen, por favor espera un momento...');
            
            const base64Image = await generarImagenGemini(prompt);
            
            if (base64Image) {
                const media = new MessageMedia('image/png', base64Image, 'imagen_ai.png');
                await client.sendMessage(msg.from, media, { caption: `Imagen generada para: "${prompt}"` });
            } else {
                await msg.reply('❌ Hubo un error al generar la imagen. Intenta de nuevo.');
            }
        }

        // 3. MÓDULO DE BÚSQUEDA DE VIDEO Y MÚSICA
        // Comandos: !video [nombre] o !musica [nombre]
        else if (textoMensaje.startsWith('!video ') || textoMensaje.startsWith('!musica ') || textoMensaje.startsWith('!música ')) {
            const esVideo = textoMensaje.startsWith('!video');
            const prompt = msg.body.substring(esVideo ? 7 : 8).trim();
            
            await chat.sendStateTyping();
            const resultado = await buscarYouTube(prompt, esVideo);
            await msg.reply(resultado);
        }

        // Comando de ayuda
        else if (textoMensaje === '!ayuda') {
            const menu = `🤖 *MENÚ PRINCIPAL DEL BOT IA* 🤖\n\n` +
                         `Usa los siguientes comandos:\n\n` +
                         `🧠 *!ai [pregunta]* -> Para pedir cualquier información.\n` +
                         `🎨 *!img [descripción]* -> Para crear imágenes con IA.\n` +
                         `🎵 *!musica [canción]* -> Para buscar música.\n` +
                         `🎬 *!video [video]* -> Para buscar un video.\n\n` +
                         `_Desarrollado con arquitectura de alto rendimiento._`;
            await msg.reply(menu);
        }

    } catch (error) {
        console.error('Error en el procesamiento del mensaje:', error);
        await msg.reply('⚠️ Ocurrió un error interno en el sistema al procesar tu solicitud.');
    }
});

// ==========================================
// FUNCIONES DE INTEGRACIÓN DE APIS (SERVICIOS)
// ==========================================

/**
 * Consulta a la API de Gemini para texto.
 */
async function generarTextoGemini(prompt) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{ parts: [{ text: prompt }] }]
        };
        
        const response = await axios.post(url, payload);
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Error en Gemini Text API:', error.response ? error.response.data : error.message);
        return 'Lo siento, mi cerebro de IA no pudo procesar esa solicitud en este momento.';
    }
}

/**
 * Consulta a la API de Gemini para generar imágenes (modelo gemini-3.1-flash-image)
 */
async function generarImagenGemini(prompt) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig: {
                responseModalities: ['IMAGE']
            }
        };

        const response = await axios.post(url, payload);
        const parts = response.data?.candidates?.[0]?.content?.parts;
        const imagePart = parts?.find(p => p.inlineData);
        
        if (imagePart && imagePart.inlineData) {
            return imagePart.inlineData.data; // Retorna el string Base64
        }
        return null;
    } catch (error) {
        console.error('Error en Gemini Image API:', error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Busca videos o música en YouTube usando yt-search
 */
async function buscarYouTube(query, esVideo) {
    try {
        const r = await ytSearch(query);
        const videos = r.videos;
        
        if (videos.length > 0) {
            const topResult = videos[0];
            const tipo = esVideo ? '🎬 *Video encontrado*' : '🎵 *Música encontrada*';
            return `${tipo}\n\n*Título:* ${topResult.title}\n*Duración:* ${topResult.timestamp}\n*Canal:* ${topResult.author.name}\n\n*Enlace:* ${topResult.url}`;
        } else {
            return 'No encontré resultados para tu búsqueda.';
        }
    } catch (error) {
        console.error('Error en YouTube Search:', error);
        return 'Hubo un error al buscar en los servidores multimedia.';
    }
}

// Iniciar el cliente
client.initialize();

// ==========================================
// 🚀 SERVIDOR WEB (REQUERIDO PARA LA NUBE)
// ==========================================
// Las plataformas gratuitas (Render/Koyeb) exigen que la app escuche en un puerto web.
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🟢 Sistema Bot de WhatsApp IA Activo y funcionando en la nube.');
});

app.listen(port, () => {
    console.log(`🌐 Servidor web de mantenimiento escuchando en el puerto ${port}`);
});