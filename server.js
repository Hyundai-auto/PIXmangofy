const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/pix", async (req, res) => {
    console.log("--- Nova requisição PIX (Mapeamento de Resposta) ---");
    
    const apiKey = process.env.MANGOFY_API_KEY ? process.env.MANGOFY_API_KEY.trim() : null;
    const storeCode = process.env.MANGOFY_STORE_CODE ? process.env.MANGOFY_STORE_CODE.trim() : null;

    if (!apiKey || !storeCode) {
        return res.status(500).json({ success: false, error: "Configuração ausente no servidor." });
    }

    try {
        const { payer_name, payer_email, payer_document, payer_phone, amount } = req.body;
        const amountInCents = Math.round(parseFloat(amount) * 100);
        const externalCode = `${Date.now()}`;
        const clientIp = req.headers["x-forwarded-for"]?.split(',')[0] || req.socket.remoteAddress || "127.0.0.1";

        const payload = {
            store_code: storeCode,
            external_code: externalCode,
            payment_method: "pix",
            payment_format: "regular",
            installments: 1,
            payment_amount: amountInCents,
            postback_url: process.env.POSTBACK_URL || "https://seusite.com/webhook",
            items: [
                { 
                    name: "Pedido Online",
                    quantity: 1,
                    amount: amountInCents,
                    description: "Compra via Checkout"
                }
            ],
            customer: {
                name: payer_name,
                email: payer_email,
                phone: payer_phone,
                document: payer_document,
                ip: clientIp
            },
            pix: {
                expires_in_days: 1
            }
        };

        const response = await fetch("https://checkout.mangofy.com.br/api/v1/payment", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": apiKey,
                "Store-Code": storeCode
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Erro Mangofy:", JSON.stringify(data, null, 2));
            return res.status(500).json({ success: false, error: data.message || "Erro na Mangofy" });
        }

        // LOG CRÍTICO: Vamos ver exatamente como a Mangofy envia o PIX
        console.log("RESPOSTA SUCESSO MANGOFY:", JSON.stringify(data, null, 2));

        // Tenta capturar o código PIX em todas as variações possíveis
        let pixCode = null;
        
        // Opção 1: Dentro do objeto pix (padrão documentação)
        if (data.pix) {
            if (data.pix.qrcode_copy_and_paste) pixCode = data.pix.qrcode_copy_and_paste;
            else if (data.pix.qrcode) pixCode = data.pix.qrcode;
            else if (data.pix.code) pixCode = data.pix.code;
            else if (typeof data.pix === 'string') pixCode = data.pix;
        }
        
        // Opção 2: Na raiz do objeto
        if (!pixCode) {
            pixCode = data.pix_code || data.qrcode_copy_and_paste || data.qrcode || data.payment_pix_code;
        }

        // Opção 3: Dentro de um objeto 'data' ou 'payment'
        if (!pixCode && data.data) {
            pixCode = data.data.pix_code || data.data.qrcode_copy_and_paste || data.data.qrcode;
        }

        if (!pixCode) {
            console.error("CÓDIGO PIX NÃO ENCONTRADO NA RESPOSTA ACIMA.");
            return res.status(500).json({ 
                success: false, 
                error: "PIX gerado, mas o código não foi encontrado na resposta. Verifique os logs do servidor.",
                debug_info: data // Enviamos para o front para ajudar no debug se necessário
            });
        }

        console.log("PIX CAPTURADO COM SUCESSO!");
        return res.json({ success: true, pixCode: pixCode });

    } catch (err) {
        console.error("Erro Crítico:", err);
        return res.status(500).json({ success: false, error: "Erro interno no servidor." });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
