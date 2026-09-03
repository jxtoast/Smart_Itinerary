export type Country = {
    id: string;
    country_code: string;
    country_name: string;
    airport: {
      airport_code: string;
    };
};