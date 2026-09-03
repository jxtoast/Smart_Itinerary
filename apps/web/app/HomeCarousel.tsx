import React, { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'

const imgWidth = 200
const imgHeight = 200

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
]

export default function Carousel() {
    const [carouselActiveItem, setCarouselActiveItem] = useState(0)

    const carouselRef = useRef<HTMLDivElement>(null)

    const scrollItem = () => {
        setCarouselActiveItem(prevState => {
            if (carouselImgSrc.length - 1 > prevState) {
                return prevState + 1
            } else {
                return 0
            }
        })
    }

    const autoplay = useCallback(() => setInterval(scrollItem, 1000), [])

    useEffect(() => {
        const play = autoplay()
        return () => clearInterval(play)
    }, [autoplay])

    useEffect(() => {
        carouselRef.current?.scroll({ left: imgWidth * carouselActiveItem })
    }, [carouselActiveItem])


    return (
        <div className='pt-8'>
            <div ref={carouselRef} className="carousel carousel-center bg-neutral rounded-box max-w-5xl space-x-4 p-4">
                {
                    carouselImgSrc.map(imgSrc =>
                        <div key={imgSrc} className="carousel-item">
                            <Image
                                width={imgWidth}
                                height={imgHeight}
                                src={imgSrc}
                                alt={imgSrc}
                                style={{ width: imgWidth, height: imgHeight }}
                                quality={100}
                            />
                        </div>
                    )
                }
            </div>
        </div>
    )
}
