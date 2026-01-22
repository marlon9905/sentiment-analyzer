// backend/server.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '32kb' })); // evita payloads enormes
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// IMPORTANTE: NO hardcodear tokens
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;

// Modelos de Hugging Face (intentaremos usarlos primero)
const HF_MODELS = {
  spanish: 'pysentimiento/robertuito-sentiment-analysis',
  multilingual: 'lxyuan/distilbert-base-multilingual-cased-sentiments-student',
  english: 'cardiffnlp/twitter-roberta-base-sentiment-latest'
};

// Diccionarios para análisis local
const PALABRAS_SENTIMIENTO = {
  positivas: [
    'feliz', 'alegre', 'excelente', 'bueno', 'genial', 'perfecto', 'increíble',
    'maravilloso', 'fantástico', 'hermoso', 'amor', 'encanta', 'gustar', 'éxito',
    'victoria', 'ganar', 'mejor', 'contento', 'satisfecho', 'positivo', 'bien',
    'agradecido', 'afortunado', 'sonrisa', 'risa', 'diversión', 'esperanza',
    'optimista', 'brillante', 'espectacular', 'extraordinario', 'fascinante',
    'estupendo', 'magnífico', 'sobresaliente', 'encantador', 'admirable',
    'recomendable', 'útil', 'valioso', 'eficiente', 'efectivo', 'logro', 'felicidad'
  ],
  negativas: [
    'triste', 'malo', 'terrible', 'horrible', 'pésimo', 'odio', 'molesto',
    'enojado', 'frustrado', 'decepcionado', 'dolor', 'sufrimiento', 'problema',
    'error', 'fallo', 'perder', 'pérdida', 'peor', 'difícil', 'negativo',
    'deprimente', 'aburrido', 'cansado', 'enfermo', 'preocupado', 'miedo',
    'ansiedad', 'desastre', 'fracaso', 'lamentable', 'insoportable', 'mierda',
    'porquería', 'basura', 'asco', 'disgusto', 'desagradable', 'inútil',
    'deficiente', 'defectuoso', 'feo', 'detestable', 'patético', 'miserable',
    // lenguaje coloquial/insultos (nota: ver detección de frases abajo)
    'jueputa', 'perra', 'maldito', 'triplejuputa', 'cabronazo', 'chingada',
    'chingar', 'pinche', 'culero', 'culiada', 'zorra', 'puta',
    'hijo de la gran puta'
  ],
  intensificadores: [
    'muy', 'demasiado', 'extremadamente', 'súper', 'super', 'ultra', 'totalmente',
    'completamente', 'absolutamente', 'increíblemente', 'bastante', 'realmente',
    'verdaderamente', 'sumamente', 'altamente', 'excesivamente'
  ],
  negadores: [
    'no', 'nunca', 'jamás', 'jamas', 'tampoco', 'ningún', 'ningun', 'ninguno', 'nada', 'nadie'
  ]
};

// ============================
// Utilidades de normalización
// ============================

// Normaliza texto (minúsculas y espacios) para detectar frases
function normalizeForPhraseMatch(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[“”"'.!,;:()¿?¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokeniza: quita puntuación simple, conserva letras/números/acentos
function tokenize(text) {
  const cleaned = (text || '')
    .toLowerCase()
    .replace(/[“”"'.!,;:()¿?¡]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned ? cleaned.split(' ') : [];
}

// Normalizar etiquetas HF
function normalizeSentiment(label) {
  const labelLower = (label || '').toLowerCase();

  if (labelLower.includes('pos') || labelLower === 'positive') return 'positive';
  if (labelLower.includes('neg') || labelLower === 'negative') return 'negative';
  if (labelLower.includes('neu') || labelLower === 'neutral') return 'neutral';

  return 'neutral';
}

// ============================
// Endpoint principal
// ============================

app.post('/api/analyze', async (req, res) => {
  try {
    const { text, model = 'spanish' } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'El campo "text" (string) es requerido' });
    }

    // Intentar con Hugging Face si hay key
    if (HUGGING_FACE_API_KEY) {
      try {
        const hfResult = await analyzeWithHuggingFace(text, model);
        return res.json(hfResult);
      } catch (hfError) {
        // Fallback local si HF falla
        const localResult = analyzeLocally(text, model, {
          warning: `Fallback local: Hugging Face falló (${safeErr(hfError)})`
        });
        return res.json(localResult);
      }
    }

    // Si no hay key, usar local con aviso explícito
    const localResult = analyzeLocally(text, model, {
      warning: 'HUGGING_FACE_API_KEY no configurada: usando análisis local'
    });
    return res.json(localResult);

  } catch (error) {
    res.status(500).json({
      error: 'Error interno del servidor',
      message: safeErr(error)
    });
  }
});

function safeErr(err) {
  return (err && err.message) ? err.message : String(err);
}

// ============================
// Hugging Face
// ============================

async function analyzeWithHuggingFace(text, model) {
  const selectedModel = HF_MODELS[model] || HF_MODELS.spanish;

  const response = await axios.post(
    `https://api-inference.huggingface.co/models/${selectedModel}`,
    {
      inputs: text,
      options: { wait_for_model: true }
    },
    {
      headers: {
        Authorization: `Bearer ${HUGGING_FACE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  const results = Array.isArray(response.data?.[0]) ? response.data[0] : response.data;

  let maxScore = -1;
  let topSentiment = null;

  (results || []).forEach(item => {
    if (item?.score > maxScore) {
      maxScore = item.score;
      topSentiment = item;
    }
  });

  if (!topSentiment) {
    throw new Error('Respuesta inválida de Hugging Face');
  }

  const sentiment = normalizeSentiment(topSentiment.label);

  return {
    success: true,
    text,
    model: selectedModel,
    source: 'Hugging Face API',
    analysis: {
      sentiment,
      confidence: (maxScore * 100).toFixed(2),
      label: topSentiment.label,
      allScores: (results || []).map(r => ({
        label: r.label,
        score: (r.score * 100).toFixed(2)
      }))
    },
    timestamp: new Date().toISOString()
  };
}

// ============================
// Análisis local (corregido)
// ============================

function analyzeLocally(text, model, opts = {}) {
  const tokens = tokenize(text);
  const normalizedPhraseText = normalizeForPhraseMatch(text);

  // Ventana de negación (N tokens siguientes)
  const NEGATION_WINDOW = 2;
  let negationScope = 0;

  let scorePositivo = 0;
  let scoreNegativo = 0;

  let multiplier = 1;

  const detected = {
    positivas: [],
    negativas: [],
    intensificadores: [],
    negadores: [],
    frasesNegativas: []
  };

  // Detección simple de frases negativas (si están en la lista)
  // Nota: esto suma 1 vez por frase encontrada (no por token).
  // Evita duplicar si ya se contará por tokens.
  const negativePhrases = PALABRAS_SENTIMIENTO.negativas.filter(w => w.includes(' '));
  for (const phrase of negativePhrases) {
    if (normalizedPhraseText.includes(phrase)) {
      scoreNegativo += 1.5; // ponderación ligera por frase
      detected.frasesNegativas.push(phrase);
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const palabra = tokens[i];

    // Activar negación
    if (PALABRAS_SENTIMIENTO.negadores.includes(palabra)) {
      negationScope = NEGATION_WINDOW;
      detected.negadores.push(palabra);
      continue;
    }

    const negacionActiva = negationScope > 0;

    // Intensificadores (aplican al siguiente match pos/neg)
    if (PALABRAS_SENTIMIENTO.intensificadores.includes(palabra)) {
      multiplier = 1.5;
      detected.intensificadores.push(palabra);

      // disminuir scope de negación aunque sea intensificador
      if (negationScope > 0) negationScope--;
      continue;
    }

    // Match por inclusión (conserva tu enfoque original), pero sobre token limpio
    const esPositiva = PALABRAS_SENTIMIENTO.positivas.some(p => palabra.includes(p));
    const esNegativa = PALABRAS_SENTIMIENTO.negativas
      .filter(w => !w.includes(' '))
      .some(p => palabra.includes(p));

    if (esPositiva) {
      const points = 1 * multiplier;
      if (negacionActiva) {
        scoreNegativo += points;
        detected.negativas.push(palabra);
      } else {
        scorePositivo += points;
        detected.positivas.push(palabra);
      }
      multiplier = 1;
    } else if (esNegativa) {
      const points = 1 * multiplier;
      if (negacionActiva) {
        scorePositivo += points;
        detected.positivas.push(palabra);
      } else {
        scoreNegativo += points;
        detected.negativas.push(palabra);
      }
      multiplier = 1;
    }

    // Consumir ventana de negación al final del token
    if (negationScope > 0) negationScope--;
  }

  // Calcular sentimiento final
  const total = scorePositivo + scoreNegativo;

  let sentiment;
  let confidence;

  if (total === 0) {
    sentiment = 'neutral';
    confidence = 60;
  } else {
    const ratioPositivo = scorePositivo / total;

    if (ratioPositivo > 0.65) {
      sentiment = 'positive';
      confidence = Math.min(95, 60 + ratioPositivo * 40);
    } else if (ratioPositivo < 0.35) {
      sentiment = 'negative';
      confidence = Math.min(95, 60 + (1 - ratioPositivo) * 40);
    } else {
      sentiment = 'neutral';
      confidence = 60 + Math.abs(ratioPositivo - 0.5) * 20;
    }
  }

  return {
    success: true,
    text,
    model: 'Análisis Local Avanzado (heurístico)',
    source: 'Local Processing Engine',
    warning: opts.warning,
    analysis: {
      sentiment,
      confidence: confidence.toFixed(2),
      label: sentiment.charAt(0).toUpperCase() + sentiment.slice(1),
      allScores: [
        { label: 'Positive', score: ((scorePositivo / (total || 1)) * 100).toFixed(2) },
        { label: 'Negative', score: ((scoreNegativo / (total || 1)) * 100).toFixed(2) },
        { label: 'Neutral', score: (total === 0 ? 100 : 0).toFixed(2) }
      ],
      details: {
        positiveWords: detected.positivas.length,
        negativeWords: detected.negativas.length,
        intensifiers: detected.intensificadores.length,
        negations: detected.negadores.length,
        detectedWords: detected
      }
    },
    timestamp: new Date().toISOString()
  };
}

// ============================
// Batch (local)
// ============================

app.post('/api/analyze-batch', (req, res) => {
  try {
    const { texts, model = 'spanish' } = req.body;

    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: 'El campo "texts" debe ser un array' });
    }

    const results = texts.map(t => {
      try {
        return analyzeLocally(String(t || ''), model);
      } catch (e) {
        return { text: t, error: safeErr(e) };
      }
    });

    res.json({
      success: true,
      results,
      total: texts.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Error en análisis por lotes',
      message: safeErr(error)
    });
  }
});

// Modelos
app.get('/api/models', (req, res) => {
  res.json({
    models: [
      { id: 'spanish', name: 'Análisis en Español', description: 'Optimizado para español' },
      { id: 'multilingual', name: 'Multilingüe', description: 'Soporta múltiples idiomas' },
      { id: 'english', name: 'Inglés', description: 'Optimizado para inglés' }
    ]
  });
});

// Health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    engine: 'Local NLP + Hugging Face (si está configurado)',
    hf_enabled: Boolean(HUGGING_FACE_API_KEY),
    timestamp: new Date().toISOString(),
    version: '2.1.0'
  });
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor: http://localhost:${PORT}`);
  console.log(`API:      http://localhost:${PORT}/api`);
  console.log(`Health:   http://localhost:${PORT}/api/health`);
});
