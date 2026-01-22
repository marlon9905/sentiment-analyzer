// frontend/app.js
        const API_URL = 'http://localhost:3000/api';

        async function analyzeSentiment() {
            const text = document.getElementById('textInput').value.trim();
            const model = document.getElementById('modelSelect').value;
            
            const resultDiv = document.getElementById('result');
            const errorDiv = document.getElementById('error');
            const loadingDiv = document.getElementById('loading');
            const btn = document.querySelector('.btn');

            resultDiv.style.display = 'none';
            errorDiv.style.display = 'none';

            if (!text) {
                showError('Por favor, escribe un texto para analizar');
                return;
            }

            loadingDiv.style.display = 'block';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_URL}/analyze`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: text,
                        model: model
                    })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Error en la petición');
                }

                const data = await response.json();
                displayResult(data.analysis, data);

            } catch (error) {
                console.error('Error:', error);
                
                if (error.message.includes('Failed to fetch')) {
                    showError('⚠️ No se pudo conectar con el servidor. Asegúrate de que el backend esté corriendo en http://localhost:3000');
                } else {
                    showError(error.message);
                }
            } finally {
                loadingDiv.style.display = 'none';
                btn.disabled = false;
            }
        }

        function displayResult(analysis, fullData) {
            if (!analysis) {
                showError('No se pudo procesar el análisis');
                return;
            }

            const resultDiv = document.getElementById('result');
            const emojiDiv = document.getElementById('emoji');
            const labelDiv = document.getElementById('sentimentLabel');
            const textDiv = document.getElementById('sentimentText');
            const confidenceFill = document.getElementById('confidenceFill');
            const detailsDiv = document.getElementById('details');

            resultDiv.className = 'result';

            let emoji = '';
            let label = '';
            let description = '';

            if (analysis.sentiment === 'positive') {
                emoji = '😊';
                label = 'Sentimiento Positivo';
                description = 'El texto expresa emociones positivas, alegría o satisfacción.';
                resultDiv.classList.add('positive');
            } else if (analysis.sentiment === 'negative') {
                emoji = '😞';
                label = 'Sentimiento Negativo';
                description = 'El texto expresa emociones negativas, tristeza o insatisfacción.';
                resultDiv.classList.add('negative');
            } else {
                emoji = '😐';
                label = 'Sentimiento Neutral';
                description = 'El texto es neutro, sin emociones marcadas.';
                resultDiv.classList.add('neutral');
            }

            emojiDiv.textContent = emoji;
            labelDiv.textContent = label;
            textDiv.textContent = description;
            confidenceFill.style.width = analysis.confidence + '%';
            confidenceFill.textContent = analysis.confidence + '%';

            let detailsHTML = `
                <div class="detail-row">
                    <span class="detail-label">Modelo utilizado:</span>
                    <span class="detail-value">${fullData.model || 'Análisis Local'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fuente:</span>
                    <span class="detail-value">${fullData.source || 'Local Processing'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Etiqueta original:</span>
                    <span class="detail-value">${analysis.label}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Timestamp:</span>
                    <span class="detail-value">${new Date(fullData.timestamp).toLocaleString('es-ES')}</span>
                </div>
            `;

            // Mostrar detalles adicionales si existen
            if (analysis.details) {
                detailsHTML += '<div class="detail-row" style="margin-top: 15px;"><strong>Análisis detallado:</strong></div>';
                detailsHTML += `
                    <div class="detail-row">
                        <span class="detail-label">Palabras positivas:</span>
                        <span class="detail-value">${analysis.details.positiveWords || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Palabras negativas:</span>
                        <span class="detail-value">${analysis.details.negativeWords || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Intensificadores:</span>
                        <span class="detail-value">${analysis.details.intensifiers || 0}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Negaciones:</span>
                        <span class="detail-value">${analysis.details.negations || 0}</span>
                    </div>
                `;
            }

            if (analysis.allScores && analysis.allScores.length > 0) {
                detailsHTML += '<div class="detail-row" style="margin-top: 15px;"><strong>Todas las puntuaciones:</strong></div>';
                analysis.allScores.forEach(score => {
                    detailsHTML += `
                        <div class="detail-row">
                            <span class="detail-label">${score.label}:</span>
                            <span class="detail-value">${score.score}%</span>
                        </div>
                    `;
                });
            }

            detailsDiv.innerHTML = detailsHTML;
            resultDiv.style.display = 'block';
        }

        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }

        function clearAll() {
            document.getElementById('textInput').value = '';
            document.getElementById('result').style.display = 'none';
            document.getElementById('error').style.display = 'none';
        }

        // Verificar estado del servidor al cargar
        async function checkServerStatus() {
            try {
                const response = await fetch(`${API_URL}/health`);
                if (response.ok) {
                    console.log('✅ Servidor conectado');
                }
            } catch (error) {
                console.warn('⚠️ Servidor no disponible. Inicia el backend con: npm start');
            }
        }

        checkServerStatus();
    