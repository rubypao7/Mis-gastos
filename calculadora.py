"""Calculadora sencilla de ejemplo."""


def sumar(a, b):
    return a + b


def restar(a, b):
    return a - b


def multiplicar(a, b):
    return a * b


def dividir(a, b):
    if b == 0:
        raise ValueError("No se puede dividir entre cero")
    return a / b


def main():
    print("=== Calculadora ===")
    a = float(input("Primer número: "))
    operacion = input("Operación (+, -, *, /): ")
    b = float(input("Segundo número: "))

    operaciones = {
        "+": sumar,
        "-": restar,
        "*": multiplicar,
        "/": dividir,
    }

    if operacion not in operaciones:
        print(f"Operación no válida: {operacion}")
        return

    resultado = operaciones[operacion](a, b)
    print(f"Resultado: {a} {operacion} {b} = {resultado}")


if __name__ == "__main__":
    main()
