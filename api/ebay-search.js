// api/ebay-search.js
// Place this file in your Vercel project at: /api/ebay-search.js

// Simple in-memory rate limiting (resets on each serverless function cold start)
const rateLimitMap = new Map();

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 30; // 30 requests per minute per IP

// Simplified price cleaning function
function cleanPriceField(priceData) {
  // Handle string prices directly
  if (typeof priceData === 'string' && priceData.trim()) {
    return priceData.trim();
  }
  
  // Handle price objects from SERPAPI
  if (priceData && typeof priceData === 'object') {
    // Try the most common SERPAPI price formats
    if (priceData.raw && typeof priceData.raw === 'string') {
      return priceData.raw;
    }
    if (typeof priceData.extracted_value === 'number') {
      return `$${priceData.extracted_value.toFixed(2)}`;
    }
  }
  
  // Fallback for any unparseable price data
  return 'Price not available';
}

// Rate limiting function
function checkRateLimit(clientIP) {
  const now = Date.now();
  const clientData = rateLimitMap.get(clientIP) || { requests: 0, resetTime: now + RATE_LIMIT_WINDOW_MS };
  
  // Reset the window if expired
  if (now > clientData.resetTime) {
    clientData.requests = 0;
    clientData.resetTime = now + RATE_LIMIT_WINDOW_MS;
  }
  
  // Check if over the limit
  if (clientData.requests >= RATE_LIMIT_MAX_REQUESTS) {
    return false; // Rate limited
  }
  
  // Increment request count
  clientData.requests++;
  rateLimitMap.set(clientIP, clientData);
  
  // Clean up old entries periodically (basic cleanup)
  if (rateLimitMap.size > 1000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [ip, data] of rateLimitMap.entries()) {
      if (data.resetTime < cutoff) {
        rateLimitMap.delete(ip);
      }
    }
  }
  
  return true; // Not rate limited
}

// Get client IP address
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         '127.0.0.1';
}

// Configure allowed origins
function getAllowedOrigins() {
  // Use environment variable for allowed origins, with fallback
  const envOrigins = process.env.ALLOWED_ORIGINS;
  
  if (envOrigins) {
    return envOrigins.split(',').map(origin => origin.trim());
  }
  
  // Default allowed origins for puckgenius.com
  return [
    'https://www.puckgenius.com',
    'https://puckgenius.com',
    'http://localhost:3000', // For local development
    'http://127.0.0.1:3000'  // For local development
  ];
}

// CORS handler
function handleCORS(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = getAllowedOrigins();
  
  // Check if origin is allowed
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

export default async function handler(req, res) {
  // Handle CORS
  handleCORS(req, res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting check
  const clientIP = getClientIP(req);
  if (!checkRateLimit(clientIP)) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded. Please wait before making more requests.',
      retryAfter: 60 
    });
  }

  try {
    // Get the API key from environment variables
    const API_KEY = process.env.SERPAPI_KEY;
    
    if (!API_KEY) {
      return res.status(500).json({ 
        error: 'SERPAPI_KEY environment variable not set' 
      });
    }

    // Get search parameters from request body
    const searchParams = req.body;
    
    // Basic input validation
    if (!searchParams || typeof searchParams !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid request body' 
      });
    }
    
    // Validate required parameters
    if (!searchParams._nkw && !searchParams.category_id) {
      return res.status(400).json({ 
        error: 'Search query (_nkw) or category_id is required' 
      });
    }

    // Build the SERPAPI request URL
    const serpApiUrl = new URL('https://serpapi.com/search');
    
    // Add required parameters
    serpApiUrl.searchParams.append('engine', 'ebay');
    serpApiUrl.searchParams.append('api_key', API_KEY);
    serpApiUrl.searchParams.append('ebay_domain', 'ebay.com');

    // Add all search parameters from the frontend (with basic sanitization)
    Object.keys(searchParams).forEach(key => {
      const value = searchParams[key];
      if (value !== null && value !== undefined && value !== '') {
        // Basic sanitization - only allow alphanumeric, spaces, and common punctuation
        const sanitizedValue = String(value).replace(/[^\w\s.,()-]/g, '');
        if (sanitizedValue) {
          serpApiUrl.searchParams.append(key, sanitizedValue);
        }
      }
    });

    console.log('Making SERPAPI request for IP:', clientIP);

    // Make the request to SERPAPI with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(serpApiUrl.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'eBay-Widget/1.0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`SERPAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for SERPAPI errors
    if (data.error) {
      return res.status(400).json({ 
        error: 'Search failed: ' + data.error 
      });
    }

    // Clean up the data before sending to frontend
    if (data.organic_results && Array.isArray(data.organic_results)) {
      data.organic_results = data.organic_results.map(product => {
        // Clean the product data
        const cleanProduct = { ...product };
        
        // Remove shipping field entirely to prevent [object Object] issues
        delete cleanProduct.shipping;
        
        // Use the simplified price cleaning function
        cleanProduct.price = cleanPriceField(cleanProduct.price);
        
        return cleanProduct;
      });
    }

    // Return the cleaned search results
    res.status(200).json(data);

  } catch (error) {
    // Handle timeout errors specifically
    if (error.name === 'AbortError') {
      return res.status(408).json({ 
        error: 'Search request timed out. Please try again.' 
      });
    }
    
    console.error('Backend error:', error);
    res.status(500).json({ 
      error: 'Failed to search eBay products: ' + error.message 
    });
  }
}
