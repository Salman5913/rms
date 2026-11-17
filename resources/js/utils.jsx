/** downloads a CSV export; throws an Error with the server's message if it fails */
const handleExport = async (name = 'data', api) => {
    const response = await fetch(api, {
        headers: {
            Authorization: `Bearer ${localStorage.getItem("rms_token")}`,
            // json first so validation errors come back as JSON instead of a redirect
            Accept: "application/json, text/csv",
        },
    });

    if (!response.ok) {
        let message = "Export failed. Please try again.";
        try {
            const body = await response.json();
            message = Object.values(body.errors ?? {})[0]?.[0] ?? body.message ?? message;
        } catch { /* not JSON */ }
        throw new Error(message);
    }

    // use the server's file name (includes the date range) when it sends one
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const serverName = disposition.match(/filename="?([^";]+)"?/i)?.[1];

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = serverName ?? name.replace(/\.?csv$/i, '') + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
};
export default handleExport;

// "Today, 9:27 PM" / "Yesterday, 8:15 PM" / "10 Nov 2026, 9:27 PM"
export const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d)) return "—";

    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

    if (diffDays === 0) return `Today, ${time}`;
    if (diffDays === 1) return `Yesterday, ${time}`;

    const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${date}, ${time}`;
};
