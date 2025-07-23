module.exports = (req, res) => {
  res.status(200).json({ 
    message: 'Test API works!', 
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });
}; 