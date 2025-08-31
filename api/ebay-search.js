// api/ebay-search.js
// Place this file in your Vercel project at: /api/ebay-search.js

// Comprehensive price cleaning function
function cleanPriceField(priceData) {
  // If it's already a string, return as-is
  if (typeof priceData === 'string') {
    return priceData;
  }
  
  // If it's not an object or is null/undefined, return fallback
  if (!priceData || typeof priceData !== 'object') {
    return 'Price not available';
  }
  
  // Try various common SERPAPI price object structures
  const attempts = [
    priceData.raw,                    // {raw: "$25.99"}
    priceData.formatted,              // {formatted: "$25.99"}  
    priceData.extracted_value ? `$${priceData.extracted_value.toFixed(2)}` : null,  // {extracted_value: 25.99}
    priceData.extracted ? `$${priceData.extracted.toFixed(2)}` : null,              // {extracted: 25.99}
    priceData.value ? `$${priceData.value.toFixed(2)}` : null,                      // {value: 25.99}
    priceData.amount ? `$${priceData.amount.toFixed(2)}` : null,                    // {amount: 25.99}
    priceData.price ? `$${priceData.price.toFixed(2)}` : null,                     // {price: 25.99}
  ];
  
  // Return the first valid attempt
  for (const attempt of attempts) {
    if (attempt && typeof attempt === 'string' && attempt.trim() !== '') {
      return attempt;
    }
  }
  
  // If all attempts failed, return fallback
  console.warn('Could not parse price object:', priceData);
  return 'Price not available';
}

export default async function handler(req, res) {
  // Enable CORS for all origins (adjust for production)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Add all search parameters from the frontend
    Object.keys(searchParams).forEach(key => {
      if (searchParams[key] !== null && searchParams[key] !== undefined && searchParams[key] !== '') {
        serpApiUrl.searchParams.append(key, searchParams[key]);
      }
    });

    console.log('Making SERPAPI request:', serpApiUrl.toString());

    // Make the request to SERPAPI
    const response = await fetch(serpApiUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'eBay-Widget/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`SERPAPI request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for SERPAPI errors
    if (data.error) {
      return res.status(400).json({ 
        error: 'SERPAPI Error: ' + data.error 
      });
    }

    // Clean up the data before sending to frontend
    if (data.organic_results) {
      data.organic_results = data.organic_results.map(product => {
        // Remove shipping field entirely to prevent [object Object] issues
        const cleanProduct = { ...product };
        delete cleanProduct.shipping;
        
        // Use the comprehensive price cleaning function
        cleanProduct.price = cleanPriceField(cleanProduct.price);
        
        return cleanProduct;
      });
    }

    // Return the cleaned search results
    res.status(200).json(data);

  } catch (error) {
    console.error('Backend error:', error);
    res.status(500).json({ 
      error: 'Failed to search eBay products: ' + error.message 
    });
  }
}

// Alternative using the serpapi npm package (recommended)
// First install: npm install serpapi

/*
import { getJson } from 'serpapi';

// Comprehensive price cleaning function
function cleanPriceField(priceData) {
  // If it's already a string, return as-is
  if (typeof priceData === 'string') {
    return priceData;
  }
  
  // If it's not an object or is null/undefined, return fallback
  if (!priceData || typeof priceData !== 'object') {
    return 'Price not available';
  }
  
  // Try various common SERPAPI price object structures
  const attempts = [
    priceData.raw,                    // {raw: "$25.99"}
    priceData.formatted,              // {formatted: "$25.99"}  
    priceData.extracted_value ? `$${priceData.extracted_value.toFixed(2)}` : null,  // {extracted_value: 25.99}
    priceData.extracted ? `$${priceData.extracted.toFixed(2)}` : null,              // {extracted: 25.99}
    priceData.value ? `$${priceData.value.toFixed(2)}` : null,                      // {value: 25.99}
    priceData.amount ? `$${priceData.amount.toFixed(2)}` : null,                    // {amount: 25.99}
    priceData.price ? `$${priceData.price.toFixed(2)}` : null,                     // {price: 25.99}
  ];
  
  // Return the first valid attempt
  for (const attempt of attempts) {
    if (attempt && typeof attempt === 'string' && attempt.trim() !== '') {
      return attempt;
    }
  }
  
  // If all attempts failed, return fallback
  console.warn('Could not parse price object:', priceData);
  return 'Price not available';
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const API_KEY = process.env.SERPAPI_KEY;
    
    if (!API_KEY) {
      return res.status(500).json({ 
        error: 'SERPAPI_KEY environment variable not set' 
      });
    }

    const searchParams = {
      engine: 'ebay',
      ebay_domain: 'ebay.com',
      api_key: API_KEY,
      ...req.body
    };

    // Use serpapi package
    const results = await new Promise((resolve, reject) => {
      getJson(searchParams, (json) => {
        if (json.error) {
          reject(new Error(json.error));
        } else {
          resolve(json);
        }
      });
    });

    // Clean up the data before sending to frontend
    if (results.organic_results) {
      results.organic_results = results.organic_results.map(product => {
        // Remove shipping field entirely to prevent [object Object] issues
        const cleanProduct = { ...product };
        delete cleanProduct.shipping;
        
        // Use the comprehensive price cleaning function
        cleanProduct.price = cleanPriceField(cleanProduct.price);
        
        return cleanProduct;
      });
    }

    res.status(200).json(results);

  } catch (error) {
    console.error('Backend error:', error);
    res.status(500).json({ 
      error: 'Failed to search eBay products: ' + error.message 
    });
  }
}
*/
