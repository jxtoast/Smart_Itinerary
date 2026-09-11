/* eslint-disable prefer-const */
import { animate, motion, useMotionValue } from "framer-motion";
import Card from "./Card";
import useMeasure from "react-use-measure";
import { useEffect } from "react";

export default function ImageCarousel() {
  const carouselImgSrc = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/250px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Front_view_of_Statue_of_Liberty_with_pedestal_and_base_2024.jpg/250px-Front_view_of_Statue_of_Liberty_with_pedestal_and_base_2024.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Sydney_Australia._%2821339175489%29.jpg/250px-Sydney_Australia._%2821339175489%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Mount_Everest_as_seen_from_Drukair2_PLW_edit_Cropped.jpg/288px-Mount_Everest_as_seen_from_Drukair2_PLW_edit_Cropped.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Stonehenge2007_07_30.jpg/220px-Stonehenge2007_07_30.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/India_Gate_on_the_evening_of_77th_Independence_day.jpg/200px-India_Gate_on_the_evening_of_77th_Independence_day.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Taj_Mahal_%28Edited%29.jpeg/250px-Taj_Mahal_%28Edited%29.jpeg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/bb/Machu_Picchu%2C_2023_%28012%29.jpg/270px-Machu_Picchu%2C_2023_%28012%29.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Colosseo_2020.jpg/270px-Colosseo_2020.jpg",
  ];

  let [ref, { width }] = useMeasure();
  const xTranslation = useMotionValue(0);
  const oneSetWidth = carouselImgSrc.length * 200 + (carouselImgSrc.length - 1) * 16;
  useEffect(() => {
    if (!width) return;
    let controls;
    // The final position should take into account the offset for the gap
    const finalPosition = -oneSetWidth-16;
    controls = animate(xTranslation, [0, finalPosition], {
      ease: "linear",
      duration: 25,
      repeat: Infinity,
      repeatType: "loop",
      repeatDelay: 0,
    });
    return controls.stop;
  }, [xTranslation, width]);

  return (
    <div className="w-3/4 overflow-hidden mx-auto relative">
      <motion.div className="flex gap-4" ref={ref} style={{ x: xTranslation }}>
        {[...carouselImgSrc, ...carouselImgSrc].map((item, idx) => (
          <Card image={item} key={idx} />
        ))}
      </motion.div>
    </div>
  );
}
