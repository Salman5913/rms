export default {
    content: ["./resources/js/**/*.{js,jsx}"],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: "#EEF0FD",
                    100: "#E0E4FB",
                    200: "#C3C9F6",
                    300: "#9EA6EE",
                    500: "#5B67E0",
                    600: "#4F5BD5",
                    700: "#3F49B8",
                    800: "#323B94",
                },
            },
            // progress bar of the GearLoader in ui.jsx: fills left to right, holds, then restarts
            keyframes: {
                "loader-bar": {
                    "0%": { transform: "scaleX(0)" },
                    "70%, 100%": { transform: "scaleX(1)" },
                },
            },
            animation: {
                "loader-bar": "loader-bar 2.4s ease-in-out infinite",
            },
        },
    },
    plugins: [],
};
