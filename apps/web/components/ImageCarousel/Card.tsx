import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

interface CardProps {
  image: string;
}

const Card: React.FC<CardProps> = ({ image }) => {
  const [showOverlay, setShowOverlay] = useState<boolean>(false);
  return (
    <motion.div
      className="relative overflow-hidden h-[200px] min-w-[200px] bg-slate-400 rounded-xl flex justify-center items-center"
    >
      {/* {showOverlay && (
        <div className="absolute inset-0 z-10 flex justify-center items-center">
          <div className="absolute bg-black pointer-events-none opacity-50 h-full w-full" />
          <h1 className="bg-white font-semibold text-sm z-10 px-3 py-2 rounded-full flex items-center gap-[0.5ch] hover:opacity-75">
            <span className="text-black">Explore now</span>
          </h1>
        </div>
      )} */}
      <Image src={image} alt={image} fill style={{ objectFit: "cover" }} />
    </motion.div>
  );
};

export default Card;
