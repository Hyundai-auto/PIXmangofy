require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/pix', async (req, res) => {
    console.log('--- Nova requisição PIX (Mangofy) ---');
    try {
        const { payer_name, amount } = req.body;
        console.log('Dados recebidos:', { payer_name, amount });

        // Dados Padronizados solicitados pelo usuário
        const FIXED_CPF = '53347866860';
        const firstName = payer_name ? payer_name.trim().split(' ')[0] : 'Cliente';
        const amountInCents = Math.round(parseFloat(amount) * 100);

        // Payload para a API da Mangofy
        const payload = {
            store_code: process.env.MANGOFY_STORE_CODE,
            payment_method: 'pix',
            payment_format: 'regular',
            installments: 1,
            payment_amount: amountInCents,
            customer: {
                name: firstName,
                email: 'cliente@email.com',
                document: FIXED_CPF,
                phone: '11999999999',
                ip: '127.0.0.1'
            },
            items: [
                {
                    title: 'Pedido Checkout',
                    unitPrice: amountInCents,
                    quantity: 1,
                    tangible: false
                }
            ],
            pix: {
                expires_in_days: 1
            },
            shipping: {
                street: 'Rua Exemplo',
                street_number: '123',
                neighborhood: 'Bairro',
                city: 'Sao Paulo',
                state: 'SP',
                zip_code: '01001000',
                country: 'BR'
            }
        };

        const apiKey = process.env.MANGOFY_API_KEY;
        if (!apiKey || !process.env.MANGOFY_STORE_CODE) {
            console.error('ERRO: MANGOFY_API_KEY ou MANGOFY_STORE_CODE não configurados.');
            return res.status(500).json({ success: false, error: 'Configuração da API Mangofy ausente.' });
        }

        console.log('Chamando API Mangofy...');
        const response = await fetch('https://checkout.mangofy.com.br/api/v1/payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Erro da Mangofy (Status ' + response.status + '):', JSON.stringify(data, null, 2));
            return res.status(response.status).json({
                success: false,
                error: data.message || 'Erro na API da Mangofy.'
            });
        }

        console.log('Sucesso Mangofy!');
        // Na Mangofy, o QR Code PIX costuma vir em data.pix.qrcode ou data.pix_qrcode
        // Verificando os campos comuns baseados na estrutura de resposta
        const qrCode = data.pix_qrcode || (data.pix && data.pix.qrcode) || data.payment_url;

        if (!qrCode) {
            console.error('QR Code não encontrado na resposta Mangofy:', JSON.stringify(data, null, 2));
            return res.status(500).json({ success: false, error: 'QR Code não gerado.' });
        }

        return res.json({
            success: true,
            pixCode: qrCode,
            orderId: data.payment_code
        });

    } catch (err) {
        console.error('Erro Crítico no Servidor:', err);
        return res.status(500).json({ success: false, error: 'Erro interno.' });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor Mangofy rodando na porta ${PORT}`);
});
