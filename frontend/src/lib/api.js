import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const fetchSprites = () => api.get("/sprites").then((r) => r.data);
export const createSprite = (payload) => api.post("/sprites", payload).then((r) => r.data);
export const updateSprite = (id, payload) => api.put(`/sprites/${id}`, payload).then((r) => r.data);
export const deleteSprite = (id) => api.delete(`/sprites/${id}`).then((r) => r.data);
export const seedSprites = () => api.post("/sprites/seed").then((r) => r.data);

export const fetchSettings = () => api.get("/settings").then((r) => r.data);
export const updateSettings = (payload) => api.put("/settings", payload).then((r) => r.data);
