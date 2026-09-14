// Configuration file to manage Backend EC2 Endpoint

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://YOUR_AWS_EC2_PUBLIC_IP:5000/api';

export default API_BASE_URL;
