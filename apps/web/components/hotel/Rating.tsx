export default function Rating({ rating }: { rating: number }) {
  const maxStars = 5;
  const fullStars = Math.floor(rating); // Number of full stars
  const hasHalfStar = rating % 1 !== 0; // Check if there's a half star
  const emptyStars = maxStars * 2 - fullStars * 2 - (hasHalfStar ? 1 : 0); // Remaining empty half stars
  return (
    <div className="flex flex-row gap-4">
      <div className="rating rating-md rating-half text-xl">
        {/* Full Stars */}
        {Array.from({ length: fullStars * 2 }, (_, index) =>
          index % 2 == 0 ? (
            <input
              key={`full-${index}`}
              type="radio"
              className="mask mask-star-2 mask-half-1 bg-yellow-500 cursor-default"
              disabled
            />
          ) : (
            <input
              key={`full-${index}`}
              type="radio"
              className="mask mask-star-2 mask-half-2 bg-yellow-500 cursor-default"
              disabled
            />
          )
        )}

        {/* Half Star */}
        {hasHalfStar && (
          <input
            key="half-star"
            type="radio"
            className="mask mask-star-2 mask-half-1 bg-yellow-500 cursor-default"
            disabled
          />
        )}

        {/* Empty Stars */}
        {Array.from({ length: emptyStars }, (_, index) =>
          index % 2 == 0 ? (
            <input
              key={`empty-${index}`}
              type="radio"
              className={`mask mask-star-2 ${
                hasHalfStar ? "mask-half-2" : "mask-half-1"
              } bg-gray-300 cursor-default`}
              disabled
            />
          ) : (
            <input
              key={`empty-${index}`}
              type="radio"
              className={`mask mask-star-2 ${
                hasHalfStar ? "mask-half-1" : "mask-half-2"
              } bg-gray-300 cursor-default`}
              disabled
            />
          )
        )}
      </div>
      {rating + "/5"}
    </div>
  );
}
