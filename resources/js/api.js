import axios from "axios";

const api = axios.create({ baseURL: "/api" });

/* number of requests still waiting for a response (BootLoader in ui.jsx waits for it to reach 0) */
let inFlight = 0;
const listeners = new Set();
const track = (delta) => {
    inFlight += delta;
    listeners.forEach((fn) => fn(inFlight));
};
export const requestsInFlight = () => inFlight;
export const onRequestsChange = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};

api.interceptors.request.use((config) => {
    track(1);
    const token = localStorage.getItem("rms_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (r) => {
        track(-1);
        return r;
    },
    (err) => {
        track(-1);
        if (err.response?.status === 401) {
            localStorage.removeItem("rms_token");
            if (!location.pathname.startsWith("/login")) location.href = "/login";
        }
        return Promise.reject(err);
    }
);

export default api;
