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
    console.log("--- Nova requisição PIX (Dados Reais) ---");
    
    const apiKey = process.env.MANGOFY_API_KEY ? process.env.MANGOFY_API_KEY.trim() : null;
    const storeCode = process.env.MANGOFY_STORE_CODE ? process.env.MANGOFY_STORE_CODE.trim() : null;

    if (!apiKey || !storeCode) {
        return res.status(500).json({ success: false, error: "Configuração ausente no servidor." });
    }

    try {
        const { payer_name, payer_email, payer_document, payer_phone, amount } = req.body;
        
        const amountInCents = Math.round(parseFloat(amount) * 100);
        const externalCode = `PIX-${Date.now()}`;

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
                ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress || "127.0.0.1"
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

        if (!response.ok || data.payment_status === "gateway_error") {
            console.error("Erro Mangofy:", JSON.stringify(data, null, 2));
            return res.status(500).json({ 
                success: false, 
                error: data.payment_status === "gateway_error" ? "O gateway recusou a transação. Use dados reais e válidos." : (data.message || "Erro na Mangofy")
            });
        }

        let pixCode = null;
        if (data.pix && data.pix.qrcode_copy_and_paste) pixCode = data.pix.qrcode_copy_and_paste;
        else if (data.pix_code) pixCode = data.pix_code;
        else if (data.qrcode_copy_and_paste) pixCode = data.qrcode_copy_and_paste;

        if (!pixCode) {
            return res.status(500).json({ success: false, error: "Código PIX não encontrado na resposta." });
        }

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
