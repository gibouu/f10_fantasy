"use client";

import { motion } from "framer-motion";

export default function Loading() {
    return (
        <div className="relative">
            <motion.div
                initial={{ x: 0 }}
                animate={{ x: 100 }}
                transition={{ duration: 1, type: "linear" }}
                className="text-center"
            >
                HELLO
            </motion.div>
        </div>
    );
}
